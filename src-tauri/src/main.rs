#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

/// 红绿灯重应用的防抖代数（原子计数）
static NEXT_DEBOUNCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// 前端启动时轮询该命令拿内嵌服务端口（见 src/main.tsx waitForServerBase）
#[tauri::command]
fn get_server_port(port: tauri::State<'_, u16>) -> u16 {
    *port.inner()
}

/// 缩小红绿灯并居中于第一栏。
/// 关键认知：圆点符号由 AppKit 按固定主题尺寸绘制，改 frame bounds 不会缩放视觉
/// （只影响命中区域）——所以 frame 只管布局（统一尺寸、等距、居中、保持点击区域），
/// 视觉缩小必须用 layer 缩放变换（微信同款手法），两者配合。
#[cfg(target_os = "macos")]
fn shrink_traffic_lights(win: &tauri::Window) {
    use objc2_app_kit::{NSButton, NSWindow, NSWindowButton};
    use objc2_foundation::{NSPoint, NSSize};
    use objc2_quartz_core::CATransform3D;

    /// 目标视觉直径（pt）
    const VISUAL: f64 = 10.0;
    /// frame 统一边长 = 系统自然尺寸（pt），点击区域维持原生手感
    const NAT: f64 = 14.0;
    /// 相邻圆点视觉间隙（pt）
    const GAP: f64 = 7.0;
    /// 第一栏宽度，与前端 NavRail w-[56px] 保持一致
    const RAIL_W: f64 = 56.0;

    let s = VISUAL / NAT;
    // 视觉圆在 frame 内四周的留边，同时是缩放的中心锚补偿量
    let pad = (NAT - VISUAL) / 2.0;
    unsafe {
        let ns = win.ns_window().expect("获取 NSWindow 失败") as *mut NSWindow;
        let ns = &*ns;
        let Some(first) = ns
            .standardWindowButton(NSWindowButton::CloseButton)
            .map(|b| b.frame())
        else {
            println!("[traffic-light] 未取到标题栏按钮，跳过");
            return;
        };
        // 垂直：y 沿用 trafficLightPosition 的结算值，仅按 frame 高差校正中心
        let y = first.origin.y + (first.size.height - NAT) / 2.0;
        // 水平：视觉圆点组（3×VISUAL + 2×GAP）在第一栏居中；frame 左缘 = 视觉左缘 - pad
        let total = 3.0 * VISUAL + 2.0 * GAP;
        let x0 = (RAIL_W - total) / 2.0 - pad;

        // 以 frame 中心为锚缩放：m41/m42 平移 pad 抵消默认左上锚点
        let t = CATransform3D {
            m11: s, m12: 0.0, m13: 0.0, m14: 0.0,
            m21: 0.0, m22: s, m23: 0.0, m24: 0.0,
            m31: 0.0, m32: 0.0, m33: 1.0, m34: 0.0,
            m41: pad, m42: pad, m43: 0.0, m44: 1.0,
        };

        for (i, btn) in [
            NSWindowButton::CloseButton,
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ]
        .into_iter()
        .enumerate()
        {
            let Some(b) = ns.standardWindowButton(btn) else { continue };
            let b: &NSButton = &b;
            let old = b.frame();
            let x = x0 + i as f64 * (VISUAL + GAP);
            b.setWantsLayer(true);
            b.setFrameSize(NSSize::new(NAT, NAT));
            b.setFrameOrigin(NSPoint::new(x, y));
            if let Some(layer) = b.layer() {
                layer.setTransform(t);
            }
            println!(
                "[traffic-light] {btn:?} 原始 origin=({:.1},{:.1}) size=({:.1}x{:.1}) -> frame=({x:.1},{y:.1}) {NAT}x{NAT}, 视觉≈{VISUAL}pt",
                old.origin.x, old.origin.y, old.size.width, old.size.height
            );
        }
        println!("[traffic-light] 完成: 视觉直径={VISUAL}, 间隙={GAP}");
    }
}

fn main() {
    tauri::Builder::default()
        .on_window_event(|win, event| {
            // 全屏切换/resize 时 AppKit 会重置标题栏按钮布局，需重新应用。
            // Resized 拖拽期间逐帧触发，直接应用会闪：用防抖，静默 200ms 后才补一次。
            #[cfg(target_os = "macos")]
            {
                if win.label() == "main" {
                    let need_reapply = matches!(
                        event,
                        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(false)
                    );
                    if need_reapply {
                        println!("[window-event] {event:?} → 重新应用红绿灯样式（防抖中）");
                        let w = win.clone();
                        let w2 = w.clone();
                        // 先清旧定时器（存在线程里做简易防抖：旧线程检测到新标记即退出）
                        let gen = NEXT_DEBOUNCE.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(200));
                            // 已有更新的事件重置过：放弃本次应用
                            if gen != NEXT_DEBOUNCE.load(std::sync::atomic::Ordering::SeqCst) {
                                return;
                            }
                            let _ = w.run_on_main_thread(move || shrink_traffic_lights(&w2));
                        });
                    }
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(win) = app.get_webview_window("main") {
                // setup 时窗口尚未 orderFront，AppKit 显示标题栏时会重置按钮 layer；
                // 延迟到窗口实际显示后再缩放（主线程执行）
                let w = win.as_ref().window().clone();
                let w2 = w.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(400));
                    let _ = w.run_on_main_thread(move || shrink_traffic_lights(&w2));
                });
            }
            let handle = app.handle().clone();
            // 内嵌 HTTP 服务在 Tauri 的 tokio 运行时里拉起，不阻塞窗口创建
            tauri::async_runtime::spawn(async move {
                if let Err(e) = run_server(&handle).await {
                    eprintln!("MindVerse 内嵌服务启动失败: {e}");
                    std::process::exit(1);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_port])
        .run(tauri::generate_context!())
        .expect("MindVerse 启动失败");
}

async fn run_server(handle: &tauri::AppHandle) -> Result<(), String> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mindverse_server=info,tower_http=warn".into()),
        )
        .init();

    let data_dir = handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {e}"))?;

    let db_path = data_dir.join("mindverse.db");
    // 首次启动迁移：把开发库带过来（打包版 cwd 是 /，不会命中，仅 tauri dev 生效）
    if !db_path.exists() {
        let dev_db = std::path::Path::new("../server/data/mindverse.db");
        if dev_db.exists() {
            let _ = std::fs::copy(dev_db, &db_path);
            let _ = std::fs::copy(
                dev_db.parent().unwrap().join("mindverse.db-wal"),
                data_dir.join("mindverse.db-wal"),
            );
            println!("已从开发库迁移数据到 {}", data_dir.display());
        }
    }

    // 稳定 JWT 密钥：落盘复用，重启后登录态不失效
    let secret_file = data_dir.join("jwt_secret");
    let jwt_secret = match std::fs::read_to_string(&secret_file) {
        Ok(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => {
            let s = uuid::Uuid::new_v4().to_string();
            std::fs::write(&secret_file, &s).map_err(|e| format!("写入密钥失败: {e}"))?;
            s
        }
    };

    let port = mindverse_server::start_server(mindverse_server::ServerConfig {
        database_path: db_path.to_string_lossy().into_owned(),
        // 随机空闲端口：免配置、不跟残留进程冲突
        listen_addr: "127.0.0.1:0".into(),
        jwt_secret,
    })
    .await?;

    println!("MindVerse 内嵌服务监听 127.0.0.1:{port}");
    handle.manage(port);
    Ok(())
}
