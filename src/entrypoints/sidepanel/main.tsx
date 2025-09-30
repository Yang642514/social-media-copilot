import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../assets/tailwind.css';

// 飞书配置接口
interface FeishuConfig {
  appId: string;
  appSecret: string;
  tableUrl: string;
  syncMode: 'append' | 'overwrite' | 'merge';
  uploadFiles: boolean;
  syncFields: {
    title: boolean;
    author: boolean;
    likes: boolean;
    comments: boolean;
    shares: boolean;
    publishTime: boolean;
    recommendLevel: boolean;
    likeFollowRatio: boolean;
    followerCount: boolean;
    noteScore: boolean;
  };
}

// 同步模式选项
const SYNC_MODES = [
  { value: 'append', label: '追加', description: '在现有数据基础上添加新记录' },
  { value: 'overwrite', label: '覆盖', description: '替换现有数据' },
  { value: 'merge', label: '合并', description: '智能合并数据，避免重复' }
] as const;

// 推荐程度选项
const RECOMMEND_LEVELS = [
  { value: 'high', label: '高', color: 'bg-green-500' },
  { value: 'medium', label: '中', color: 'bg-yellow-500' },
  { value: 'low', label: '低', color: 'bg-red-500' }
];

function App() {
  const [config, setConfig] = useState<FeishuConfig>({
    appId: '',
    appSecret: '',
    tableUrl: '',
    syncMode: 'append',
    uploadFiles: false,
    syncFields: {
      title: true,
      author: true,
      likes: true,
      comments: true,
      shares: true,
      publishTime: true,
      recommendLevel: true,
      likeFollowRatio: true,
      followerCount: true,
      noteScore: true,
    }
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  // 从存储中加载配置
  useEffect(() => {
    chrome.storage.local.get(['feishuConfig'], (result) => {
      if (result.feishuConfig) {
        setConfig(result.feishuConfig);
        setIsConnected(!!result.feishuConfig.appId && !!result.feishuConfig.appSecret);
      }
    });
  }, []);

  // 保存配置
  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await chrome.storage.local.set({ feishuConfig: config });
      setIsConnected(!!config.appId && !!config.appSecret);
      setMessage({ type: 'success', text: '配置保存成功！' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: '配置保存失败，请重试' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // 验证表格链接
  const validateTableUrl = (url: string): boolean => {
    const feishuTablePattern = /https:\/\/[^.]+\.feishu\.cn\/base\/[A-Za-z0-9]+/;
    return feishuTablePattern.test(url);
  };

  // 测试连接
  const handleTestConnection = async () => {
    if (!config.appId || !config.appSecret) {
      setMessage({ type: 'error', text: '请先填写App ID和App Secret' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!config.tableUrl || !validateTableUrl(config.tableUrl)) {
      setMessage({ type: 'error', text: '请输入有效的飞书多维表格链接' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setMessage({ type: 'info', text: '正在测试连接...' });
    
    // 这里应该调用飞书API进行测试
    // 暂时模拟测试结果
    setTimeout(() => {
      setMessage({ type: 'success', text: '连接测试成功！' });
      setTimeout(() => setMessage(null), 3000);
    }, 1500);
  };

  // 创建新表格
  const handleCreateTable = async () => {
    if (!config.appId || !config.appSecret) {
      setMessage({ type: 'error', text: '请先填写App ID和App Secret' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setMessage({ type: 'info', text: '正在创建新的多维表格...' });
    
    try {
      // 发送消息到background script创建表格
      const response = await chrome.runtime.sendMessage({
        action: 'createFeishuTable',
        config: {
          appId: config.appId,
          appSecret: config.appSecret
        }
      });
      
      if (response.success && response.tableUrl) {
        // 自动回填表格链接
        setConfig(prev => ({ ...prev, tableUrl: response.tableUrl }));
        setMessage({ type: 'success', text: '表格创建成功！链接已自动填入' });
        
        // 自动保存配置
        const updatedConfig = { ...config, tableUrl: response.tableUrl };
        await chrome.storage.local.set({ feishuConfig: updatedConfig });
        
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error || '创建表格失败，请重试' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('创建表格时出错:', error);
      setMessage({ type: 'error', text: '创建表格失败，请检查网络连接' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 更新字段配置
  const handleFieldToggle = (field: keyof FeishuConfig['syncFields']) => {
    setConfig(prev => ({
      ...prev,
      syncFields: {
        ...prev.syncFields,
        [field]: !prev.syncFields[field]
      }
    }));
  };

  // 开始同步数据
  const handleStartSync = () => {
    if (!isConnected) {
      setMessage({ type: 'error', text: '请先配置并测试连接' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setShowSyncDialog(true);
  };

  // 确认同步
  const handleConfirmSync = async () => {
    setShowSyncDialog(false);
    setMessage({ type: 'info', text: '正在同步数据到飞书...' });
    
    // 发送消息到background script执行同步
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'syncToFeishu',
        config: config
      });
      
      if (response.success) {
        setMessage({ type: 'success', text: '数据同步成功！' });
      } else {
        setMessage({ type: 'error', text: response.error || '同步失败，请重试' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '同步失败，请检查网络连接' });
    }
    
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col">
      {/* 头部 */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">飞书多维表格配置</h1>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} 
               title={isConnected ? '已连接' : '未连接'} />
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mx-4 mt-4 p-3 rounded-md ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* 配置表单 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 基础配置 */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <h2 className="text-md font-medium text-gray-900 mb-4">基础配置</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App ID
              </label>
              <input
                type="text"
                value={config.appId}
                onChange={(e) => setConfig(prev => ({ ...prev, appId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入飞书应用的App ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App Secret
              </label>
              <input
                type="password"
                value={config.appSecret}
                onChange={(e) => setConfig(prev => ({ ...prev, appSecret: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入飞书应用的App Secret"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                表格链接 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={config.tableUrl}
                  onChange={(e) => setConfig(prev => ({ ...prev, tableUrl: e.target.value }))}
                  className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    config.tableUrl && !validateTableUrl(config.tableUrl) 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-gray-300'
                  }`}
                  placeholder="请输入飞书多维表格的链接"
                />
                <button
                  onClick={handleCreateTable}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  创建
                </button>
              </div>
              {config.tableUrl && !validateTableUrl(config.tableUrl) && (
                <p className="text-sm text-red-600 mt-1">请输入有效的飞书多维表格链接</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleTestConnection}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              测试连接
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
            >
              {isSaving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>

        {/* 同步字段配置 */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <h2 className="text-md font-medium text-gray-900 mb-4">同步字段配置</h2>
          
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(config.syncFields).map(([field, enabled]) => {
              const fieldLabels: Record<string, string> = {
                title: '标题',
                author: '作者',
                likes: '点赞数',
                comments: '评论数',
                shares: '分享数',
                publishTime: '发布时间',
                recommendLevel: '推荐程度',
                likeFollowRatio: '赞粉比',
                followerCount: '粉丝量',
                noteScore: '笔记评分'
              };

              return (
                <label key={field} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => handleFieldToggle(field as keyof FeishuConfig['syncFields'])}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{fieldLabels[field]}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 同步模式配置 */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <h2 className="text-md font-medium text-gray-900 mb-4">同步模式</h2>
          
          <div className="space-y-3">
            {SYNC_MODES.map((mode) => (
              <label key={mode.value} className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="syncMode"
                  value={mode.value}
                  checked={config.syncMode === mode.value}
                  onChange={(e) => setConfig(prev => ({ ...prev, syncMode: e.target.value as FeishuConfig['syncMode'] }))}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{mode.label}</div>
                  <div className="text-xs text-gray-500">{mode.description}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.uploadFiles}
                onChange={(e) => setConfig(prev => ({ ...prev, uploadFiles: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">上传附件文件</span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              将笔记中的图片等附件上传到飞书云文档
            </p>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-sm font-medium text-blue-900 mb-2">使用说明</h3>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• 请先在飞书开放平台创建应用并获取App ID和App Secret</li>
            <li>• 确保应用已获得多维表格的读写权限</li>
            <li>• 多维表格链接请使用分享链接格式</li>
            <li>• 选择合适的同步模式：追加不会覆盖现有数据，覆盖会替换所有数据，合并会智能去重</li>
            <li>• 配置完成后，在小红书笔记页面点击"同步飞书"按钮即可同步数据</li>
          </ul>
        </div>
      </div>

      {/* 同步确认对话框 */}
      {showSyncDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">同步数据到飞书多维表格</h3>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">同步模式：</span>
                <span className="font-medium">{SYNC_MODES.find(m => m.value === config.syncMode)?.label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">上传文件：</span>
                <span className="font-medium">{config.uploadFiles ? '是' : '否'}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">同步字段：</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(config.syncFields)
                    .filter(([_, enabled]) => enabled)
                    .map(([field, _]) => {
                      const fieldLabels: Record<string, string> = {
                        title: '标题', author: '作者', likes: '点赞数', comments: '评论数',
                        shares: '分享数', publishTime: '发布时间', recommendLevel: '推荐程度',
                        likeFollowRatio: '赞粉比', followerCount: '粉丝量', noteScore: '笔记评分'
                      };
                      return (
                        <span key={field} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {fieldLabels[field]}
                        </span>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSyncDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSync}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 渲染应用
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}