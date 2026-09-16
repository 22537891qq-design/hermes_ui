using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace HermesMonitorLauncher
{
    static class Program
    {
        private static Process serverProcess = null;
        private static NotifyIcon trayIcon = null;
        private static ContextMenuStrip trayMenu = null;
        private static readonly string ServerUrl = "http://localhost:3000";

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(appDir);

            // 1. 检查是否已经运行
            if (IsPortInUse(3000))
            {
                // 如果已在运行，直接唤起浏览器
                OpenBrowser(ServerUrl);
                MessageBox.Show(
                    "Hermes 监控服务已在运行中！\n已为您自动打开浏览器访问大屏页面：\n" + ServerUrl,
                    "Hermes Token 监控中心",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            // 2. 检查 Node.js 是否安装
            if (!IsNodeInstalled())
            {
                DialogResult result = MessageBox.Show(
                    "未检测到 Node.js 运行环境！\n\nHermes 监控系统需要 Node.js 支持。\n是否立即前往 Node.js 官网下载？",
                    "缺少环境依赖",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                );
                if (result == DialogResult.Yes)
                {
                    OpenBrowser("https://nodejs.org/");
                }
                return;
            }

            // 3. 启动后台 node server.js 进程
            StartNodeServer(appDir);

            // 4. 等待 1.5 秒后自动打开浏览器
            new Thread(() =>
            {
                Thread.Sleep(1500);
                OpenBrowser(ServerUrl);
            }).Start();

            // 5. 创建系统托盘图标
            InitTrayIcon(appDir);

            // 消息循环保持托盘驻留
            Application.Run();
        }

        private static void InitTrayIcon(string appDir)
        {
            trayMenu = new ContextMenuStrip();
            
            ToolStripMenuItem titleItem = new ToolStripMenuItem("Hermes Token 监控中心") { Enabled = false };
            titleItem.Font = new Font(titleItem.Font, FontStyle.Bold);
            trayMenu.Items.Add(titleItem);
            trayMenu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem openItem = new ToolStripMenuItem("🌐 打开监控大屏 (Web UI)", null, (s, e) => OpenBrowser(ServerUrl));
            openItem.Font = new Font(openItem.Font, FontStyle.Bold);
            trayMenu.Items.Add(openItem);

            ToolStripMenuItem testItem = new ToolStripMenuItem("💬 发送测试对话 (Test Chat)", null, (s, e) =>
            {
                OpenBrowser(ServerUrl);
            });
            trayMenu.Items.Add(testItem);

            ToolStripMenuItem restartItem = new ToolStripMenuItem("🔄 重启监控服务", null, (s, e) =>
            {
                StopNodeServer();
                Thread.Sleep(800);
                StartNodeServer(appDir);
                trayIcon.ShowBalloonTip(2000, "Hermes 服务", "服务已成功重启！", ToolTipIcon.Info);
            });
            trayMenu.Items.Add(restartItem);

            trayMenu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("❌ 退出并关闭服务", null, (s, e) =>
            {
                StopNodeServer();
                trayIcon.Visible = false;
                Application.Exit();
            });
            trayMenu.Items.Add(exitItem);

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Hermes LLM Token 实时监控";
            trayIcon.ContextMenuStrip = trayMenu;

            // 加载嵌入或本地的图标
            string icoPath = Path.Combine(appDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { trayIcon.Icon = new Icon(icoPath); } catch { trayIcon.Icon = SystemIcons.Application; }
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => OpenBrowser(ServerUrl);

            trayIcon.ShowBalloonTip(
                3000,
                "Hermes 监控大屏已启动",
                "服务正在后台运行于 http://localhost:3000\n双击托盘图标可随时打开监控大屏！",
                ToolTipIcon.Info
            );
        }

        private static void StartNodeServer(string appDir)
        {
            try
            {
                string serverScript = Path.Combine(appDir, "server.js");
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = "\"" + serverScript + "\"",
                    WorkingDirectory = appDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                serverProcess = Process.Start(psi);

                // 退出时自动关闭 Node
                AppDomain.CurrentDomain.ProcessExit += (s, e) => StopNodeServer();
            }
            catch (Exception ex)
            {
                MessageBox.Show("启动 Node 服务失败: " + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void StopNodeServer()
        {
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                    serverProcess.Dispose();
                    serverProcess = null;
                }
            }
            catch { }
        }

        private static bool IsNodeInstalled()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = "-v",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(3000);
                    return p.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(800);
                    if (success)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("无法唤起浏览器: " + ex.Message);
            }
        }
    }
}
