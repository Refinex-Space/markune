use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use reqwest::{Client, StatusCode, Url};
use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};
use std::time::Duration;

const MAX_PREVIEW_BYTES: usize = 512 * 1024;
const REQUEST_TIMEOUT_SECS: u64 = 5;
const MAX_REDIRECTS: usize = 3;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreviewMetadata {
    pub kind: &'static str,
    pub url: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'static str>,
}

#[tauri::command]
pub async fn resolve_link_preview(
    title: Option<String>,
    url: String,
) -> Result<LinkPreviewMetadata, String> {
    resolve_link_preview_metadata(title.as_deref(), &url).await
}

async fn resolve_link_preview_metadata(
    fallback_title: Option<&str>,
    source: &str,
) -> Result<LinkPreviewMetadata, String> {
    let Some(url) = normalize_source_url(source) else {
        return Ok(LinkPreviewMetadata {
            kind: "link",
            url: source.to_string(),
            title: fallback_title.unwrap_or(source).to_string(),
            domain: None,
            description: None,
            image: None,
            error: Some("invalid_url"),
        });
    };

    if !is_public_url(&url) {
        let mut metadata = fallback_metadata(&url, fallback_title);
        metadata.error = Some("blocked_url");
        return Ok(metadata);
    }

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|_| "Link preview HTTP client failed".to_string())?;

    let response = match fetch_preview_response(&client, url.clone()).await {
        Ok(response) => response,
        Err(_) => return Ok(fallback_metadata(&url, fallback_title)),
    };

    let response_url = response.url().clone();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !response.status().is_success() || !content_type.contains("text/html") {
        return Ok(fallback_metadata(&response_url, fallback_title));
    }

    let html = read_preview_html(response).await?;

    Ok(parse_link_preview_html(
        &html,
        &response_url,
        fallback_title,
    ))
}

async fn fetch_preview_response(
    client: &Client,
    start_url: Url,
) -> Result<reqwest::Response, String> {
    let mut current_url = start_url;

    for _ in 0..=MAX_REDIRECTS {
        if !is_public_url(&current_url) {
            return Err("blocked_url".to_string());
        }

        let response = client
            .get(current_url.clone())
            .header(ACCEPT, "text/html,application/xhtml+xml")
            .header(USER_AGENT, "MarkuneLinkPreview/1.0")
            .send()
            .await
            .map_err(|_| "Link preview request failed".to_string())?;

        if !is_redirect_status(response.status()) {
            return Ok(response);
        }

        let Some(location) = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
        else {
            return Ok(response);
        };

        let next_url = current_url
            .join(location)
            .ok()
            .and_then(|url| normalize_source_url(url.as_str()))
            .ok_or_else(|| "blocked_url".to_string())?;

        current_url = next_url;
    }

    Err("too_many_redirects".to_string())
}

async fn read_preview_html(mut response: reqwest::Response) -> Result<String, String> {
    let mut bytes = Vec::new();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Link preview response failed".to_string())?
    {
        let remaining = MAX_PREVIEW_BYTES.saturating_sub(bytes.len());
        if remaining == 0 {
            break;
        }

        bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
    }

    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn normalize_source_url(value: &str) -> Option<Url> {
    let input = value.trim();
    let normalized = if input.starts_with("www.") {
        format!("https://{input}")
    } else {
        input.to_string()
    };
    let url = Url::parse(&normalized).ok()?;

    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    if !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    if is_blocked_hostname(url.host_str()?) {
        return None;
    }
    if url
        .host_str()
        .and_then(|host| host.parse::<IpAddr>().ok())
        .is_some_and(is_blocked_ip_address)
    {
        return None;
    }

    Some(url)
}

fn is_public_url(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };

    if is_blocked_hostname(host) {
        return false;
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        return !is_blocked_ip_address(ip);
    }

    let port = url.port_or_known_default().unwrap_or(443);
    let Ok(addresses) = (host, port).to_socket_addrs() else {
        return false;
    };
    let addresses = addresses.collect::<Vec<_>>();

    !addresses.is_empty()
        && addresses
            .iter()
            .all(|address| !is_blocked_ip_address(address.ip()))
}

fn is_blocked_hostname(hostname: &str) -> bool {
    let normalized = hostname.trim_end_matches('.').to_ascii_lowercase();

    normalized == "localhost" || normalized.ends_with(".localhost")
}

fn is_blocked_ip_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_blocked_ipv4_address(ip),
        IpAddr::V6(ip) => is_blocked_ipv6_address(ip),
    }
}

fn is_blocked_ipv4_address(ip: Ipv4Addr) -> bool {
    let [a, b, _, _] = ip.octets();

    a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 198 && (18..=19).contains(&b))
        || a >= 224
}

fn is_blocked_ipv6_address(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();

    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || ip.to_ipv4_mapped().is_some_and(is_blocked_ipv4_address)
}

fn is_redirect_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::MOVED_PERMANENTLY
            | StatusCode::FOUND
            | StatusCode::SEE_OTHER
            | StatusCode::TEMPORARY_REDIRECT
            | StatusCode::PERMANENT_REDIRECT
    )
}

fn fallback_metadata(url: &Url, title: Option<&str>) -> LinkPreviewMetadata {
    LinkPreviewMetadata {
        kind: "link",
        url: url.to_string(),
        title: title.unwrap_or(url.as_str()).to_string(),
        domain: url
            .host_str()
            .map(|host| host.trim_start_matches("www.").to_string()),
        description: None,
        image: None,
        error: None,
    }
}

fn parse_link_preview_html(
    html: &str,
    url: &Url,
    fallback_title: Option<&str>,
) -> LinkPreviewMetadata {
    let title = find_meta_content(html, &["og:title", "twitter:title", "title"])
        .or_else(|| find_html_title(html))
        .or_else(|| fallback_title.map(ToString::to_string))
        .unwrap_or_else(|| url.to_string());
    let description = find_meta_content(
        html,
        &["og:description", "twitter:description", "description"],
    );
    let image = find_meta_content(
        html,
        &[
            "og:image:secure_url",
            "og:image",
            "twitter:image",
            "twitter:image:src",
        ],
    )
    .and_then(|image| url.join(&image).ok())
    .map(|url| url.to_string());

    LinkPreviewMetadata {
        kind: "link",
        url: url.to_string(),
        title,
        domain: url
            .host_str()
            .map(|host| host.trim_start_matches("www.").to_string()),
        description,
        image,
        error: None,
    }
}

fn find_meta_content(html: &str, names: &[&str]) -> Option<String> {
    let mut rest = html;

    while let Some(index) = rest.to_ascii_lowercase().find("<meta") {
        rest = &rest[index..];
        let Some(end) = rest.find('>') else {
            return None;
        };
        let tag = &rest[..=end];
        let attrs = parse_attributes(tag);
        let key = attrs
            .get("property")
            .or_else(|| attrs.get("name"))
            .or_else(|| attrs.get("itemprop"))
            .map(|value| value.to_ascii_lowercase());

        if key
            .as_deref()
            .is_some_and(|key| names.iter().any(|name| *name == key))
        {
            if let Some(content) = attrs.get("content") {
                return Some(compact_text(content));
            }
        }

        rest = &rest[end + 1..];
    }

    None
}

fn find_html_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let content_start = lower[start..].find('>')? + start + 1;
    let content_end = lower[content_start..].find("</title>")? + content_start;

    Some(compact_text(&html[content_start..content_end]))
}

fn parse_attributes(tag: &str) -> std::collections::HashMap<String, String> {
    let mut attrs = std::collections::HashMap::new();
    let mut cursor = tag;

    while let Some(eq_index) = cursor.find('=') {
        let name = cursor[..eq_index]
            .rsplit(|ch: char| ch.is_whitespace() || ch == '<')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        cursor = cursor[eq_index + 1..].trim_start();

        let Some(first) = cursor.chars().next() else {
            break;
        };

        let (value, rest) = if first == '"' || first == '\'' {
            let quote = first;
            let after_quote = &cursor[first.len_utf8()..];
            match after_quote.find(quote) {
                Some(end) => (&after_quote[..end], &after_quote[end + quote.len_utf8()..]),
                None => break,
            }
        } else {
            let end = cursor
                .find(|ch: char| ch.is_whitespace() || ch == '>')
                .unwrap_or(cursor.len());
            (&cursor[..end], &cursor[end..])
        };

        if !name.is_empty() {
            attrs.insert(name, decode_html_entities(value));
        }
        cursor = rest;
    }

    attrs
}

fn compact_text(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    let mut last_was_space = false;

    for ch in decode_html_entities(value).chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            _ if ch.is_whitespace() => {
                if !last_was_space {
                    output.push(' ');
                    last_was_space = true;
                }
            }
            _ => {
                output.push(ch);
                last_was_space = false;
            }
        }
    }

    output.trim().to_string()
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_www_urls_to_https() {
        assert_eq!(
            normalize_source_url("www.example.com/post").map(|url| url.to_string()),
            Some("https://www.example.com/post".to_string()),
        );
    }

    #[test]
    fn rejects_non_http_and_credentialed_urls() {
        assert!(normalize_source_url("file:///etc/passwd").is_none());
        assert!(normalize_source_url("https://user@example.com").is_none());
    }

    #[test]
    fn rejects_private_and_loopback_ip_addresses() {
        assert!(is_blocked_ip_address(IpAddr::V4(Ipv4Addr::new(
            127, 0, 0, 1
        ))));
        assert!(is_blocked_ip_address(IpAddr::V4(Ipv4Addr::new(
            10, 1, 2, 3
        ))));
        assert!(is_blocked_ip_address(IpAddr::V4(Ipv4Addr::new(
            172, 16, 0, 1
        ))));
        assert!(is_blocked_ip_address(IpAddr::V4(Ipv4Addr::new(
            192, 168, 1, 1
        ))));
        assert!(!is_blocked_ip_address(IpAddr::V4(Ipv4Addr::new(
            93, 184, 216, 34
        ))));
    }

    #[test]
    fn extracts_open_graph_metadata() {
        let metadata = parse_link_preview_html(
            r#"<!doctype html><html><head>
            <meta property="og:title" content="OG &amp; Title">
            <meta name="twitter:description" content="Twitter description">
            <meta property="og:image" content="/cover.png">
            </head></html>"#,
            &Url::parse("https://example.com/article").unwrap(),
            Some("Fallback title"),
        );

        assert_eq!(
            metadata,
            LinkPreviewMetadata {
                kind: "link",
                url: "https://example.com/article".to_string(),
                title: "OG & Title".to_string(),
                domain: Some("example.com".to_string()),
                description: Some("Twitter description".to_string()),
                image: Some("https://example.com/cover.png".to_string()),
                error: None,
            },
        );
    }
}
