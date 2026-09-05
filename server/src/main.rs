//! 独立运行入口（开发用）：配置来自环境变量，行为与旧版一致。
//! 桌面端不走这里，见 MindVerse/src-tauri（调 lib 的 start_server）。

use mindverse_server::{start_server, ServerConfig};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mindverse_server=info,tower_http=warn".into()),
        )
        .init();

    let database_path =
        std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/mindverse.db".into());
    let listen_addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
        tracing::warn!("JWT_SECRET 未设置，使用随机值（重启后所有登录态失效）");
        uuid::Uuid::new_v4().to_string()
    });

    let port = start_server(ServerConfig {
        database_path,
        listen_addr: listen_addr.clone(),
        jwt_secret,
    })
    .await
    .expect("server 启动失败");

    tracing::info!("MindVerse server 监听 http://{listen_addr}（实际端口 {port}）");
    std::future::pending::<()>().await;
}
