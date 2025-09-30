# 小红书助手

一个简单的浏览器扩展，提供小红书网页助手UI界面。

## 功能特点

- 简洁的用户界面
- 侧边栏模式，不影响正常浏览
- 专为小红书网站设计

## 技术栈

- React
- TypeScript
- Tailwind CSS
- WXT (浏览器扩展开发框架)

## 开发指南

### 环境要求

- Node.js >= 18.0.0
- npm 或 yarn

### 安装依赖

```bash
npm install
# 或
yarn
```

### 开发模式

```bash
npm run dev
# 或
yarn dev
```

### 构建扩展

```bash
npm run build
# 或
yarn build
```

### 打包为zip文件

```bash
npm run zip
# 或
yarn zip
```

## 使用方法

1. 安装扩展到Chrome浏览器
2. 访问小红书网站
3. 点击工具栏上的扩展图标，打开侧边栏
4. 在侧边栏中使用助手功能

## 项目结构

```
├── src/                  # 源代码目录
│   ├── components/       # UI组件
│   ├── entrypoints/      # 入口点
│   │   ├── background/   # 后台脚本
│   │   └── sidepanel/    # 侧边栏
│   └── utils/            # 工具函数
├── wxt.config.ts         # WXT配置文件
└── package.json          # 项目配置文件
```
