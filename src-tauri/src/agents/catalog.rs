use super::*;
use flate2::read::GzDecoder;
use std::io::Read;
use std::path::Component;
use std::time::{Duration, Instant};

const REGISTRY: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const SUPPORTED: &[&str] = &[
    "codex-acp",
    "cursor",
    "claude-acp",
    "codebuddy-code",
    "glm-acp-agent",
    "github-copilot-cli",
    "grok-build",
    "kimi",
    "minimax-code",
    "opencode",
    "qoder",
];

pub(super) fn platform() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        "x86_64" => "x86_64",
        other => other,
    };
    format!("{os}-{arch}")
}
fn allowed_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "下载地址无效")?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || ![
            "cdn.agentclientprotocol.com",
            "registry.npmjs.org",
            "github.com",
            "downloads.cursor.com",
            "nodejs.org",
        ]
        .contains(&host)
            && !host.ends_with(".githubusercontent.com")
    {
        return Err("下载来源不在可信源列表内".into());
    }
    Ok(url)
}
fn fetch(url: &str, limit: usize) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|_| "无法创建下载连接")?;
    let mut current = allowed_url(url)?;
    for _ in 0..5 {
        let response = client
            .get(current.clone())
            .header("User-Agent", "Markune-Agent-Manager")
            .send()
            .map_err(|_| "下载连接失败，请检查网络")?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("下载重定向缺少目标")?;
            current = allowed_url(
                current
                    .join(location)
                    .map_err(|_| "下载重定向无效")?
                    .as_str(),
            )?;
            continue;
        }
        let response = response
            .error_for_status()
            .map_err(|_| "下载服务暂时不可用")?;
        if response
            .content_length()
            .is_some_and(|size| size > limit as u64)
        {
            return Err("下载文件超过限制".into());
        }
        let mut data = Vec::new();
        response
            .take(limit as u64 + 1)
            .read_to_end(&mut data)
            .map_err(|_| "下载中断")?;
        if data.len() > limit {
            return Err("下载文件超过限制".into());
        }
        return Ok(data);
    }
    Err("下载重定向次数过多".into())
}
pub(super) fn read_catalog(root: &Path, refresh: bool) -> Result<Value, String> {
    let cache = root.join("catalog.json");
    if refresh {
        let data = fetch(REGISTRY, 4 * 1024 * 1024)?;
        let mut catalog: Value = serde_json::from_slice(&data).map_err(|_| "智能体目录格式无效")?;
        let entries = catalog
            .get_mut("agents")
            .and_then(Value::as_array_mut)
            .ok_or("智能体目录缺少 entries")?;
        entries.retain(|entry| {
            entry["id"]
                .as_str()
                .is_some_and(|id| SUPPORTED.contains(&id))
        });
        if entries.is_empty() {
            return Err("目录没有可支持的智能体".into());
        }
        crate::workspace::write_text_atomic(
            &cache,
            &serde_json::to_string_pretty(&catalog).map_err(|_| "无法编码目录")?,
        )
        .map_err(|_| "无法保存智能体目录")?;
    }
    let catalog = read_json(&cache).ok().unwrap_or_else(|| {
        serde_json::from_str(include_str!("../../resources/agents/catalog.json"))
            .expect("bundled catalog")
    });
    Ok(
        json!({"agents":catalog["agents"],"platform":platform(),"source":REGISTRY,"digest":hash_json(&catalog)}),
    )
}
fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}
fn extract(bytes: &[u8], url: &str, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|_| "无法创建安装目录")?;
    let mut total = 0u64;
    let mut count = 0usize;
    if url.ends_with(".zip") {
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|_| "压缩包无效")?;
        for i in 0..archive.len() {
            count += 1;
            if count > 100_000 {
                return Err("安装文件数量超限".into());
            }
            let mut entry = archive.by_index(i).map_err(|_| "无法读取安装包")?;
            let relative = entry.enclosed_name().ok_or("安装包包含越界路径")?;
            if !safe_relative(&relative) {
                return Err("安装包路径无效".into());
            }
            if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
                continue;
            }
            let target = destination.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&target).map_err(|_| "无法创建目录")?;
                continue;
            }
            total = total.saturating_add(entry.size());
            if total > 2 * 1024 * 1024 * 1024 {
                return Err("解压内容超过限制".into());
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|_| "无法创建目录")?;
            }
            let mut file = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&target)
                .map_err(|_| "安装包包含重复或不可写路径")?;
            std::io::copy(&mut entry, &mut file).map_err(|_| "解压失败")?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(
                    &target,
                    fs::Permissions::from_mode(entry.unix_mode().unwrap_or(0o644) & 0o777),
                )
                .map_err(|_| "无法设置执行权限")?;
            }
        }
    } else if url.ends_with(".tar.gz") || url.ends_with(".tgz") {
        let mut archive = tar::Archive::new(GzDecoder::new(bytes));
        for entry in archive.entries().map_err(|_| "压缩包无效")? {
            let mut entry = entry.map_err(|_| "无法读取安装包")?;
            count += 1;
            if count > 100_000 {
                return Err("安装文件数量超限".into());
            }
            let path = entry.path().map_err(|_| "安装包路径无效")?;
            if !safe_relative(&path) {
                return Err("安装包包含越界路径".into());
            }
            if !(entry.header().entry_type().is_file() || entry.header().entry_type().is_dir()) {
                continue;
            }
            total = total.saturating_add(entry.size());
            if total > 2 * 1024 * 1024 * 1024 {
                return Err("解压内容超过限制".into());
            }
            if !entry.unpack_in(destination).map_err(|_| "解压失败")? {
                return Err("安装包路径越界".into());
            }
        }
    } else {
        return Err("暂不支持此安装包格式，请配置本机智能体".into());
    }
    Ok(())
}
fn find_program(name: &str) -> Option<PathBuf> {
    let mut dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    dirs.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
    ]);
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        dirs.extend([
            home.join(".local/bin"),
            home.join(".bun/bin"),
            home.join(".qoder/entry"),
            home.join(".npm-global/bin"),
        ]);
    }
    for directory in dirs {
        for suffix in if cfg!(windows) {
            vec![".exe", ".cmd", ""]
        } else {
            vec![""]
        } {
            let path = directory.join(format!("{name}{suffix}"));
            if path.is_file() {
                return path.canonicalize().ok();
            }
        }
    }
    None
}
pub(super) fn discover() -> Vec<Value> {
    [
        ("codex-acp", "codex-acp", vec![]),
        ("cursor", "cursor-agent", vec!["acp"]),
        ("cursor", "agent", vec!["acp"]),
        ("claude-acp", "claude-agent-acp", vec![]),
        ("codebuddy-code", "codebuddy", vec!["--acp"]),
        ("glm-acp-agent", "glm-acp-agent", vec![]),
        ("github-copilot-cli", "copilot", vec!["--acp"]),
        ("grok-build", "grok", vec!["agent", "stdio"]),
        ("kimi", "kimi", vec!["acp"]),
        ("minimax-code", "mcode", vec!["acp"]),
        ("opencode", "opencode", vec!["acp"]),
        ("qoder", "qoder", vec!["--acp"]),
    ]
    .into_iter()
    .filter_map(|(id, name, args)| {
        find_program(name).map(|path| json!({"agentId":id,"executable":path,"args":args}))
    })
    .collect()
}
fn node_runtime(root: &Path) -> Result<(PathBuf, PathBuf), String> {
    if let Some(node) = find_program("node") {
        let output = command(&node, &[])
            .arg("--version")
            .output()
            .map_err(|_| "无法检查 Node.js")?;
        let version = String::from_utf8_lossy(&output.stdout);
        let major = version
            .trim()
            .trim_start_matches('v')
            .split('.')
            .next()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(0);
        if major == 24 || major == 26 {
            if let Some(npm) = find_program("npm") {
                if npm.extension().is_some_and(|v| v == "js") {
                    return Ok((node, npm));
                }
                let cli = npm
                    .parent()
                    .unwrap_or(Path::new(""))
                    .join("node_modules/npm/bin/npm-cli.js");
                if cli.is_file() {
                    return Ok((node, cli));
                }
            }
        }
    }
    let runtime = root.join("runtime");
    let receipt = runtime.join("node.json");
    if let Ok(value) = read_json(&receipt) {
        if let (Some(node), Some(npm)) = (value["node"].as_str(), value["npm"].as_str()) {
            if Path::new(node).is_file() && Path::new(npm).is_file() {
                return Ok((node.into(), npm.into()));
            }
        }
    }
    let releases: Value = serde_json::from_slice(&fetch(
        "https://nodejs.org/dist/index.json",
        4 * 1024 * 1024,
    )?)
    .map_err(|_| "无法读取 Node.js 版本")?;
    let version = releases
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find_map(|v| v["version"].as_str().filter(|s| s.starts_with("v24.")))
        })
        .ok_or("没有兼容的 Node.js 版本")?;
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win",
        other => other,
    };
    let arch = if std::env::consts::ARCH == "aarch64" {
        "arm64"
    } else {
        "x64"
    };
    let name = format!("node-{version}-{os}-{arch}");
    let archive = format!("{name}.{}", if cfg!(windows) { "zip" } else { "tar.gz" });
    let sums = String::from_utf8(fetch(
        &format!("https://nodejs.org/dist/{version}/SHASUMS256.txt"),
        1024 * 1024,
    )?)
    .map_err(|_| "Node.js 校验文件无效")?;
    let expected = sums
        .lines()
        .find_map(|line| {
            let mut words = line.split_whitespace();
            let hash = words.next()?;
            if words.next()? == archive {
                Some(hash)
            } else {
                None
            }
        })
        .ok_or("缺少 Node.js 校验值")?;
    let url = format!("https://nodejs.org/dist/{version}/{archive}");
    let bytes = fetch(&url, 256 * 1024 * 1024)?;
    if sha256(&bytes) != expected {
        return Err("Node.js 安装包校验失败".into());
    }
    fs::create_dir_all(&runtime).map_err(|_| "无法创建运行时目录")?;
    let staging = runtime.join(format!(".staging-{}", Uuid::new_v4()));
    extract(&bytes, &url, &staging)?;
    let node = staging.join(&name).join(if cfg!(windows) {
        "node.exe"
    } else {
        "bin/node"
    });
    let npm = staging.join(&name).join(if cfg!(windows) {
        "node_modules/npm/bin/npm-cli.js"
    } else {
        "lib/node_modules/npm/bin/npm-cli.js"
    });
    if !node.is_file() || !npm.is_file() {
        return Err("Node.js 安装包缺少运行程序".into());
    }
    #[cfg(unix)]
    for (name, script) in [("npm", "npm-cli.js"), ("npx", "npx-cli.js")] {
        let link = node.parent().ok_or("Node.js 路径无效")?.join(name);
        std::os::unix::fs::symlink(format!("../lib/node_modules/npm/bin/{script}"), link)
            .map_err(|_| "无法建立受管 npm 入口")?;
    }
    write_json(
        &receipt,
        &json!({"version":version,"sha256":expected,"node":node,"npm":npm}),
    )?;
    Ok((node, npm))
}
fn package_name(spec: &str) -> Result<&str, String> {
    let (name, version) = spec.rsplit_once('@').ok_or("安装包必须包含精确版本")?;
    if name.is_empty()
        || !version.chars().next().is_some_and(|c| c.is_ascii_digit())
        || version
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && !['.', '-', '+'].contains(&c))
        || name.contains("..")
        || name
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && !['@', '/', '-', '_', '.'].contains(&c))
    {
        return Err("安装包名称或版本无效".into());
    }
    Ok(name)
}
pub(super) fn install(
    root: &Path,
    id: &str,
    digest: &str,
    task: &InstallTask,
) -> Result<AgentProfile, String> {
    task.check()?;
    task.progress("正在准备安装…");
    if !SUPPORTED.contains(&id) {
        return Err("不支持此智能体标识".into());
    }
    let catalog = read_catalog(root, false)?;
    if catalog["digest"].as_str() != Some(digest) {
        return Err("智能体目录已更新，请重新选择安装版本".into());
    }
    let entry = catalog["agents"]
        .as_array()
        .and_then(|items| items.iter().find(|v| v["id"] == id))
        .ok_or("智能体不在支持目录中")?;
    if id == "qoder" && platform() == "windows-aarch64" {
        return Err("Qoder 暂不支持 Windows ARM64".into());
    }
    let version = entry["version"].as_str().ok_or("智能体缺少版本")?;
    if !version
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || ['.', '-', '_', '+'].contains(&c))
    {
        return Err("版本无效".into());
    }
    let folder = root.join("installations").join(id);
    fs::create_dir_all(&folder).map_err(|_| "无法创建安装目录")?;
    let staging = folder.join(format!(".staging-{}", Uuid::new_v4()));
    fs::create_dir(&staging).map_err(|_| "无法创建安装暂存")?;
    let outcome = (|| {
        let (program, args, integrity) = if let Some(spec) =
            entry["distribution"]["npx"]["package"].as_str()
        {
            let name = package_name(spec)?;
            let expected_package = match id {
                "codex-acp" => "@agentclientprotocol/codex-acp",
                "claude-acp" => "@agentclientprotocol/claude-agent-acp",
                "codebuddy-code" => "@tencent-ai/codebuddy-code",
                "glm-acp-agent" => "glm-acp-agent",
                "github-copilot-cli" => "@github/copilot",
                "grok-build" => "@xai-official/grok",
                "minimax-code" => "@minimax-ai/code",
                "qoder" => "@qoder-ai/qodercli",
                _ => return Err("此智能体不支持 npm 分发".into()),
            };
            if name != expected_package {
                return Err("智能体发布包身份发生变化，安装已停止".into());
            }
            task.progress("正在准备 Node.js 运行时…");
            let (node, npm) = node_runtime(root)?;
            task.check()?;
            task.progress("正在下载智能体及依赖…");
            let npm_config = root.join("runtime/npm-user.npmrc");
            let npm_global_config = root.join("runtime/npm-global.npmrc");
            fs::create_dir_all(root.join("runtime")).map_err(|_| "无法创建安装配置目录")?;
            fs::write(&npm_config, b"").map_err(|_| "无法准备安装配置")?;
            fs::write(&npm_global_config, b"").map_err(|_| "无法准备安装配置")?;
            let mut process = command(&node, &[]);
            process
                .env("NPM_CONFIG_USERCONFIG", npm_config)
                .env("NPM_CONFIG_GLOBALCONFIG", npm_global_config);
            process
                .arg(npm)
                .args([
                    "install",
                    "--save-exact",
                    "--include=optional",
                    "--no-audit",
                    "--no-fund",
                    "--registry=https://registry.npmjs.org/",
                ])
                .arg("--prefix")
                .arg(&staging)
                .arg(spec)
                .current_dir(&staging)
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            if let Some(parent) = node.parent() {
                let mut paths = vec![parent.to_path_buf()];
                if let Some(path) = std::env::var_os("PATH") {
                    paths.extend(std::env::split_paths(&path));
                }
                process.env(
                    "PATH",
                    std::env::join_paths(paths).map_err(|_| "Node.js 环境不可用")?,
                );
            }
            task.set_child(process.spawn().map_err(|_| "无法运行 npm 安装程序")?)?;
            let started = Instant::now();
            loop {
                if let Some(status) = task.try_wait()? {
                    if !status.success() {
                        return Err("智能体安装失败，请检查网络或运行时要求".into());
                    }
                    break;
                }
                if started.elapsed() > Duration::from_secs(900) {
                    task.finish_child();
                    return Err("智能体安装超时".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            task.finish_child();
            let package = staging.join("node_modules").join(name);
            let metadata = read_json(&package.join("package.json"))?;
            let bin = metadata["bin"]
                .as_str()
                .or_else(|| {
                    metadata["bin"]
                        .as_object()
                        .and_then(|map| map.values().find_map(Value::as_str))
                })
                .ok_or("安装包没有启动入口")?;
            if !safe_relative(Path::new(bin)) {
                return Err("启动入口越界".into());
            }
            let script = package
                .join(bin)
                .canonicalize()
                .map_err(|_| "启动入口不存在")?;
            if !script.starts_with(&staging) {
                return Err("启动入口不属于安装目录".into());
            }
            let (program, args) = npm_entry(
                &node,
                &script,
                string_args(&entry["distribution"]["npx"]["args"])?,
            )?;
            let lock = fs::read(staging.join("package-lock.json"))
                .map_err(|_| "安装结果没有依赖锁文件")?;
            (
                program,
                args,
                json!({"package":spec,"lockSha256":sha256(&lock)}),
            )
        } else {
            let distribution = &entry["distribution"]["binary"][platform()];
            let url = distribution["archive"]
                .as_str()
                .ok_or("此平台没有可用安装包，可使用本机 Agent 配置")?;
            task.check()?;
            task.progress("正在下载平台安装包…");
            let bytes = fetch(url, 768 * 1024 * 1024)?;
            task.check()?;
            task.progress("正在校验和解压…");
            let hash = sha256(&bytes);
            if let Some(expected) = distribution["sha256"].as_str() {
                if !hash.eq_ignore_ascii_case(expected) {
                    return Err("智能体安装包校验失败".into());
                }
            }
            extract(&bytes, url, &staging)?;
            let cmd = distribution["cmd"].as_str().ok_or("安装包缺少启动命令")?;
            let relative = PathBuf::from(cmd.replace('\\', "/"));
            if !safe_relative(&relative) {
                return Err("启动入口越界".into());
            }
            let program = staging
                .join(relative)
                .canonicalize()
                .map_err(|_| "启动程序不存在")?;
            if !program.starts_with(&staging) {
                return Err("启动入口越界".into());
            }
            (
                program,
                string_args(&distribution["args"])?,
                json!({"url":url,"archiveSha256":hash,"publisherChecksum":distribution["sha256"].is_string()}),
            )
        };
        task.check()?;
        let destination = folder.join(format!("{version}-{}", Uuid::new_v4()));
        fs::rename(&staging, &destination).map_err(|_| "无法发布安装结果")?;
        let rewrite = |value: String| {
            if let Ok(relative) = Path::new(&value).strip_prefix(&staging) {
                destination.join(relative).to_string_lossy().into_owned()
            } else {
                value
            }
        };
        let profile = AgentProfile {
            id: Uuid::new_v4().to_string(),
            agent_id: id.into(),
            name: entry["name"].as_str().unwrap_or(id).into(),
            executable: rewrite(program.to_string_lossy().into()),
            args: args.into_iter().map(rewrite).collect(),
            env: BTreeMap::new(),
            secret_keys: vec![],
            version: Some(version.into()),
            managed_path: Some(destination.to_string_lossy().into()),
            mcp_enabled: true,
            enabled: true,
        };
        let canary = match probe_installation(&profile, &destination, task) {
            Ok(value) => value,
            Err(error) => {
                let _ = fs::remove_dir_all(&destination);
                return Err(error);
            }
        };
        write_json(
            &destination.join("markune-install.json"),
            &json!({"agentId":id,"version":version,"sourceDigest":digest,"platform":platform(),"integrity":integrity,"initialize":canary}),
        )?;
        Ok(profile)
    })();
    if outcome.is_err() && staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    outcome
}
pub(super) fn string_args(value: &Value) -> Result<Vec<String>, String> {
    if value.is_null() {
        return Ok(vec![]);
    }
    let args = value.as_array().ok_or("参数必须为数组")?;
    if args.len() > 64 {
        return Err("参数过多".into());
    }
    args.iter()
        .map(|v| {
            v.as_str()
                .filter(|s| s.len() <= 8192 && !s.contains(['\0', '\r', '\n']))
                .map(str::to_string)
                .ok_or_else(|| "启动参数无效".into())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_untrusted_sources_and_unpinned_packages() {
        assert!(allowed_url("http://127.0.0.1/a.zip").is_err());
        assert!(allowed_url("https://evil.example/a.zip").is_err());
        assert!(package_name("foo@latest").is_err());
        assert!(package_name("foo@^1.2").is_err());
        assert!(package_name("@scope/pkg@1.2.3").is_ok());
    }
    #[test]
    fn rejects_archive_parent_components() {
        assert!(!safe_relative(Path::new("../escape")));
        assert!(!safe_relative(Path::new("/absolute")));
        assert!(safe_relative(Path::new("./bin/agent")));
    }
}

// refinex: A failed canary never replaces a usable installation or creates a conversation.
fn probe_installation(
    profile: &AgentProfile,
    cwd: &Path,
    task: &InstallTask,
) -> Result<Value, String> {
    task.check()?;
    task.progress("正在验证 ACP 连接…");
    use std::io::{BufRead, BufReader};
    use std::sync::mpsc::channel;
    let mut builder = command(Path::new(&profile.executable), &profile.args);
    let canary_home = cwd.join(".markune-canary");
    fs::create_dir_all(canary_home.join("codex")).map_err(|_| "无法创建安装验证目录")?;
    builder
        .current_dir(cwd)
        .env("HOME", &canary_home)
        .env("USERPROFILE", &canary_home)
        .env("CODEX_HOME", canary_home.join("codex"))
        .env("CLAUDE_CONFIG_DIR", canary_home.join("claude"))
        .env("XDG_CONFIG_HOME", canary_home.join("config"))
        .env("XDG_DATA_HOME", canary_home.join("data"))
        .env("XDG_CACHE_HOME", canary_home.join("cache"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(parent) = Path::new(&profile.executable).parent() {
        let mut paths = vec![parent.to_path_buf()];
        if let Some(path) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&path));
        }
        builder.env(
            "PATH",
            std::env::join_paths(paths).map_err(|_| "运行时 PATH 无效")?,
        );
    }
    let mut child = builder
        .spawn()
        .map_err(|_| "安装包启动失败，原版本保持可用")?;
    let output = child.stdout.take().ok_or("智能体输出不可用")?;
    let (send, receive) = channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let mut line = Vec::new();
            let result = (&mut reader)
                .take(MAX_FRAME as u64 + 1)
                .read_until(b'\n', &mut line);
            if !matches!(result,Ok(count) if count>0) || line.len() > MAX_FRAME {
                let _ = send.send(Err("安装验证连接已结束".to_string()));
                break;
            }
            let parsed = serde_json::from_slice::<Value>(&line);
            match parsed {
                Ok(message) if message["id"] == 1 => {
                    let result = if message["result"]["protocolVersion"] == 1 {
                        Ok(message["result"].clone())
                    } else {
                        Err("安装版本未通过 ACP v1 握手".into())
                    };
                    let _ = send.send(result);
                    break;
                }
                Ok(_) => {}
                Err(_) => {
                    let _ = send.send(Err("安装版本输出了非 ACP 数据".into()));
                    break;
                }
            }
        }
    });
    let request = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"markune-install-check","version":"1"},"clientCapabilities":{}}});
    let input = child.stdin.as_mut().ok_or("智能体输入不可用")?;
    let write = writeln!(input, "{request}");
    task.set_child(child)?;
    let result = if write.is_err() {
        Err("安装验证写入失败".to_string())
    } else {
        receive
            .recv_timeout(Duration::from_secs(30))
            .unwrap_or_else(|_| Err("安装版本握手超时，原版本保持可用".into()))
    };
    task.finish_child();
    let _ = fs::remove_dir_all(canary_home);
    task.check()?;
    result
}

#[cfg(test)]
mod network_tests {
    use super::*;
    #[test]
    #[ignore = "Downloads official agent releases and performs isolated initialization only"]
    fn install_selected_catalog_agents() {
        let selected =
            std::env::var("MARKUNE_ACP_INSTALL_PROBE_IDS").expect("explicit agent IDs required");
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().canonicalize().unwrap();
        let catalog = read_catalog(&root, false).unwrap();
        let mut results = vec![];
        for id in selected.split(',') {
            let started = Instant::now();
            let result = install(
                &root,
                id,
                catalog["digest"].as_str().unwrap(),
                &InstallTask::default(),
            );
            let entry = match result {
                Ok(profile) => {
                    let receipt = read_json(
                        &PathBuf::from(profile.managed_path.unwrap()).join("markune-install.json"),
                    )
                    .unwrap();
                    json!({"id":id,"outcome":"installed-and-initialized","durationMs":started.elapsed().as_millis(),"version":profile.version,"agentInfo":receipt["initialize"]["agentInfo"],"capabilities":receipt["initialize"]["agentCapabilities"],"modelPromptSent":false})
                }
                Err(error) => {
                    json!({"id":id,"outcome":"failed","durationMs":started.elapsed().as_millis(),"error":error,"modelPromptSent":false})
                }
            };
            println!("{}: {}", id, entry["outcome"]);
            results.push(entry);
            if let Ok(path) = std::env::var("MARKUNE_ACP_INSTALL_PROBE_REPORT") {
                fs::write(path,serde_json::to_string_pretty(&json!({"platform":platform(),"sourceDigest":catalog["digest"],"results":results})).unwrap()).unwrap();
            }
        }
        assert!(
            results
                .iter()
                .all(|v| v["outcome"] == "installed-and-initialized"),
            "some installation probes failed; inspect the report"
        );
    }
}

fn npm_entry(
    node: &Path,
    entry: &Path,
    mut args: Vec<String>,
) -> Result<(PathBuf, Vec<String>), String> {
    let mut bytes = [0u8; 256];
    let count = fs::File::open(entry)
        .and_then(|mut file| file.read(&mut bytes))
        .map_err(|_| "无法检查启动入口")?;
    let header = &bytes[..count];
    let native = header.starts_with(b"\x7fELF")
        || header.starts_with(b"MZ")
        || [
            &[0xcf, 0xfa, 0xed, 0xfe][..],
            &[0xce, 0xfa, 0xed, 0xfe],
            &[0xfe, 0xed, 0xfa, 0xcf],
            &[0xca, 0xfe, 0xba, 0xbe],
            &[0xbe, 0xba, 0xfe, 0xca],
        ]
        .iter()
        .any(|magic| header.starts_with(magic));
    let first_line = String::from_utf8_lossy(header)
        .lines()
        .next()
        .unwrap_or("")
        .to_owned();
    if native
        || (first_line.starts_with("#!") && !first_line.contains("node"))
        || entry
            .extension()
            .is_some_and(|extension| extension == "cmd")
    {
        return Ok((entry.into(), args));
    }
    if first_line.contains("node")
        || entry
            .extension()
            .is_some_and(|extension| ["js", "mjs", "cjs"].iter().any(|value| extension == *value))
    {
        args.insert(0, entry.to_string_lossy().into_owned());
        return Ok((node.into(), args));
    }
    Err("无法识别智能体启动入口，请使用本机 CLI 配置".into())
}
#[cfg(test)]
mod launcher_tests {
    use super::*;
    #[test]
    fn npm_native_entry_is_not_passed_to_node() {
        let dir = tempfile::tempdir().unwrap();
        let binary = dir.path().join("agent-native");
        fs::write(&binary, [0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]).unwrap();
        let (program, args) = npm_entry(Path::new("/node"), &binary, vec!["acp".into()]).unwrap();
        assert_eq!(program, binary);
        assert_eq!(args, vec!["acp"]);
    }
    #[test]
    fn npm_javascript_entry_uses_managed_node() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("agent.js");
        fs::write(&script, "#!/usr/bin/env node\n").unwrap();
        let (program, args) = npm_entry(Path::new("/node"), &script, vec!["acp".into()]).unwrap();
        assert_eq!(program, PathBuf::from("/node"));
        assert_eq!(args[0], script.to_string_lossy());
        assert_eq!(args[1], "acp");
    }
}

#[cfg(all(test, unix))]
mod canary_tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    #[test]
    fn initialize_probe_creates_isolated_codex_home_and_cleans_it() {
        let directory = tempfile::tempdir().unwrap();
        let script = directory.path().join("fixture-agent");
        fs::write(&script, "#!/bin/sh\n[ -d \"$CODEX_HOME\" ] || exit 1\n[ \"$CODEX_HOME\" = \"$HOME/codex\" ] || exit 2\nread request\nprintf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":1}}'\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).unwrap();
        let mut profile = process::test_process(directory.path(), directory.path())
            .profile
            .clone();
        profile.executable = script.to_string_lossy().into_owned();
        let result =
            probe_installation(&profile, directory.path(), &InstallTask::default()).unwrap();
        assert_eq!(result["protocolVersion"], 1);
        assert!(!directory.path().join(".markune-canary").exists());
    }
}
