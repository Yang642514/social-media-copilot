import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: '小红书助手',
    description: '小红书数据分析和同步工具',
    permissions: [
      'sidePanel',
      'storage',
      'activeTab',
      'tabs',
      'scripting'
    ],
    host_permissions: [
      '*://*.xiaohongshu.com/*',
      'https://open.feishu.cn/*',
      'http://localhost/*'
    ],
    side_panel: {
      default_path: 'sidepanel.html'
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
      sandbox: "script-src 'self' 'unsafe-inline' 'unsafe-eval'; sandbox allow-scripts allow-forms allow-popups allow-modals; child-src 'self';"
    }
  },
  dev: {
    server: {
      port: 3000
    }
  }
});
