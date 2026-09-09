use serde_json::{json, Value};

pub fn prepare(params: &Value) -> Result<(), String> {
    if params.to_string().len() > 64 * 1024
        || params.get("threadId").and_then(Value::as_str).is_none()
    {
        return Err("MCP 请求大小或任务标识无效".into());
    }
    match params.get("mode").and_then(Value::as_str) {
        Some("url") => {
            let url = tauri::Url::parse(
                params
                    .get("url")
                    .and_then(Value::as_str)
                    .ok_or("MCP 请求缺少网址")?,
            )
            .map_err(|_| "MCP 网址无效")?;
            if !matches!(url.scheme(), "https" | "http")
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err("MCP 网址不受支持".into());
            }
            Ok(())
        }
        Some("form" | "openai/form") => {
            let schema = &params["requestedSchema"];
            if schema["type"] != "object"
                || schema["properties"]
                    .as_object()
                    .is_none_or(|p| p.len() > 32)
            {
                return Err("MCP 表单必须包含至多 32 个字段".into());
            }
            Ok(())
        }
        _ => Err("不支持的 MCP 交互模式".into()),
    }
}

pub fn response(params: &Value, action: &str, content: Option<Value>) -> Result<Value, String> {
    if !matches!(action, "accept" | "decline" | "cancel") {
        return Err("MCP 回答动作无效".into());
    }
    if action != "accept" || params["mode"] == "url" {
        return Ok(json!({"action":action}));
    }
    let content = content.ok_or("请填写 MCP 表单")?;
    if content.to_string().len() > 32 * 1024 {
        return Err("MCP 表单内容过长".into());
    }
    let object = content.as_object().ok_or("MCP 回答必须是对象")?;
    let schema = &params["requestedSchema"];
    let props = schema["properties"].as_object().ok_or("MCP 表单无效")?;
    if object.keys().any(|k| !props.contains_key(k)) {
        return Err("MCP 回答包含未知字段".into());
    }
    if schema["required"].as_array().is_some_and(|keys| {
        keys.iter()
            .any(|key| key.as_str().is_none_or(|k| !object.contains_key(k)))
    }) {
        return Err("请填写所有必填字段".into());
    }
    for (key, value) in object {
        validate(&props[key], value).map_err(|_| format!("MCP 字段 {key} 不符合要求"))?;
    }
    Ok(json!({"action":action,"content":content}))
}

fn validate(schema: &Value, value: &Value) -> Result<(), ()> {
    let object = schema.as_object().ok_or(())?;
    if object.keys().any(|key| {
        !matches!(
            key.as_str(),
            "type"
                | "title"
                | "description"
                | "default"
                | "enum"
                | "enumNames"
                | "oneOf"
                | "minLength"
                | "maxLength"
                | "minimum"
                | "maximum"
                | "format"
                | "items"
                | "minItems"
                | "maxItems"
        )
    }) {
        return Err(());
    }
    match schema["type"].as_str() {
        Some("string") => {
            let text = value.as_str().ok_or(())?;
            let size = text.chars().count() as u64;
            if size > 8192
                || schema["minLength"].as_u64().is_some_and(|min| size < min)
                || schema["maxLength"].as_u64().is_some_and(|max| size > max)
            {
                return Err(());
            }
            if schema["enum"]
                .as_array()
                .is_some_and(|items| !items.contains(value))
                || schema["oneOf"]
                    .as_array()
                    .is_some_and(|items| !items.iter().any(|item| item["const"] == *value))
            {
                return Err(());
            }
            match schema["format"].as_str() {
                None => {}
                Some("email") if text.contains('@') && !text.contains(char::is_whitespace) => {}
                Some("uri") if tauri::Url::parse(text).is_ok() => {}
                Some("date") if chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok() => {}
                Some("date-time") if chrono::DateTime::parse_from_rfc3339(text).is_ok() => {}
                _ => return Err(()),
            }
        }
        Some("number" | "integer") => {
            let number = value.as_f64().ok_or(())?;
            if !number.is_finite()
                || (schema["type"] == "integer"
                    && (number.fract() != 0.0 || number.abs() > 9_007_199_254_740_991.0))
                || schema["minimum"].as_f64().is_some_and(|min| number < min)
                || schema["maximum"].as_f64().is_some_and(|max| number > max)
            {
                return Err(());
            }
        }
        Some("boolean") if value.is_boolean() => {}
        Some("array") => {
            let values = value.as_array().ok_or(())?;
            if values.len() > 64
                || schema["minItems"]
                    .as_u64()
                    .is_some_and(|min| values.len() < (min as usize))
                || schema["maxItems"]
                    .as_u64()
                    .is_some_and(|max| values.len() > (max as usize))
            {
                return Err(());
            }
            for (index, value) in values.iter().enumerate() {
                if values[..index].contains(value) {
                    return Err(());
                }
                validate(&schema["items"], value)?;
            }
        }
        _ => return Err(()),
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_form_values_and_never_echoes_declined_secrets() {
        let p = json!({"mode":"form","threadId":"t","requestedSchema":{"type":"object","required":["n"],"properties":{"n":{"type":"integer","minimum":1,"maximum":3},"s":{"type":"string","enum":["a","b"]}}}});
        prepare(&p).unwrap();
        assert!(response(&p, "accept", Some(json!({"n":2,"s":"b"}))).is_ok());
        for content in [
            json!({}),
            json!({"n":2.5}),
            json!({"n":4}),
            json!({"n":2,"x":"secret"}),
            json!({"n":2,"s":"c"}),
        ] {
            assert!(response(&p, "accept", Some(content)).is_err());
        }
        assert_eq!(
            response(&p, "decline", Some(json!({"secret":"value"}))).unwrap(),
            json!({"action":"decline"})
        );
    }
    #[test]
    fn rejects_unsafe_url() {
        for url in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "https://user:pass@example.com",
        ] {
            assert!(prepare(&json!({"mode":"url","threadId":"t","url":url})).is_err());
        }
    }
}
