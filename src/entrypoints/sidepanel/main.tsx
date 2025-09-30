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
    // 笔记信息
    noteId: boolean;
    noteUrl: boolean;
    noteType: boolean;
    noteTitle: boolean;
    noteContent: boolean;
    noteTopic: boolean;
    likes: boolean;
    collections: boolean;
    comments: boolean;
    shares: boolean;
    publishTime: boolean;
    updateTime: boolean;
    
    // 博主信息
    authorUrl: boolean;
    authorName: boolean;
    followerCount: boolean;
    likesAndCollections: boolean;
    authorBio: boolean;
    
    // 其他
    videoCover: boolean;
    videoFile: boolean;
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

// 字段分类配置
const FIELD_CATEGORIES = {
  noteInfo: {
    label: '笔记信息',
    icon: '📝',
    fields: {
      noteId: '笔记ID',
      noteUrl: '笔记链接',
      noteType: '笔记类型',
      noteTitle: '笔记标题',
      noteContent: '笔记内容',
      noteTopic: '笔记话题',
      likes: '点赞量',
      collections: '收藏量',
      comments: '评论量',
      shares: '分享量',
      publishTime: '发布时间',
      updateTime: '更新时间',
    }
  },
  authorInfo: {
    label: '博主信息',
    icon: '👤',
    fields: {
      authorUrl: '博主链接',
      authorName: '博主昵称',
      followerCount: '粉丝数',
      likesAndCollections: '获赞与收藏',
      authorBio: '博主简介',
    }
  },
  other: {
    label: '其他',
    icon: '📎',
    fields: {
      videoCover: '视频封面',
      videoFile: '视频文件',
    }
  }
};

function App() {
  const [config, setConfig] = useState<FeishuConfig>({
    appId: '',
    appSecret: '',
    tableUrl: '',
    syncMode: 'append',
    uploadFiles: false,
    syncFields: {
      // 笔记信息 - 默认选中常用字段
      noteId: true,
      noteUrl: true,
      noteType: false,
      noteTitle: true,
      noteContent: true,
      noteTopic: false,
      likes: true,
      collections: true,
      comments: true,
      shares: true,
      publishTime: true,
      updateTime: false,
      
      // 博主信息 - 默认选中基础字段
      authorUrl: false,
      authorName: true,
      followerCount: true,
      likesAndCollections: false,
      authorBio: false,       // 博主简介内容较长且更新频率低
      
      // 其他 - 默认不选中
      videoCover: false,
      videoFile: false,
    }
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    noteInfo: false,
    authorInfo: false,
    other: false
  });

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

  // 更新表格元数据
  const handleUpdateTable = async () => {
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

    // 弹出更新选项对话框
    const tableName = prompt('请输入新的表格名称（留空则不修改）:');
    const isAdvancedStr = prompt('是否开启高级权限？输入 "true" 开启，"false" 关闭，留空则不修改:');
    
    let isAdvanced: boolean | undefined;
    if (isAdvancedStr === 'true') {
      isAdvanced = true;
    } else if (isAdvancedStr === 'false') {
      isAdvanced = false;
    }

    // 如果用户没有输入任何更新内容，则取消操作
    if (!tableName && isAdvancedStr === null) {
      return;
    }

    setMessage({ type: 'info', text: '正在更新多维表格...' });
    
    try {
      // 发送消息到background script更新表格
      const response = await chrome.runtime.sendMessage({
        action: 'updateFeishuTable',
        config: {
          appId: config.appId,
          appSecret: config.appSecret,
          tableUrl: config.tableUrl
        },
        updateData: {
          name: tableName || undefined,
          isAdvanced: isAdvanced
        }
      });
      
      if (response.success) {
        setMessage({ type: 'success', text: '表格更新成功！' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error || '更新表格失败，请重试' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('更新表格时出错:', error);
      setMessage({ type: 'error', text: '更新表格失败，请检查网络连接' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 更新字段配置
  const handleFieldToggle = (field: keyof FeishuConfig['syncFields']) => {
    // 笔记ID字段不允许修改，始终保持选中状态
    if (field === 'noteId') {
      return;
    }
    
    setConfig(prev => ({
      ...prev,
      syncFields: {
        ...prev.syncFields,
        [field]: !prev.syncFields[field]
      }
    }));
  };

  // 切换类目展开状态
  const toggleCategory = (categoryKey: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }));
  };

  // 全选/取消全选某个类目
  const toggleCategoryAll = (categoryKey: keyof typeof FIELD_CATEGORIES, selectAll: boolean) => {
    const category = FIELD_CATEGORIES[categoryKey];
    const updates: Partial<FeishuConfig['syncFields']> = {};
    
    Object.keys(category.fields).forEach(fieldKey => {
      // 笔记ID字段始终保持选中状态，不受全选/取消全选影响
      if (fieldKey === 'noteId') {
        updates[fieldKey as keyof FeishuConfig['syncFields']] = true;
      } else {
        updates[fieldKey as keyof FeishuConfig['syncFields']] = selectAll;
      }
    });

    setConfig(prev => ({
      ...prev,
      syncFields: {
        ...prev.syncFields,
        ...updates
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
          
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCreateTable}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
            >
              创建新表格
            </button>
            <button
              onClick={handleUpdateTable}
              disabled={!config.tableUrl || !validateTableUrl(config.tableUrl)}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!config.tableUrl || !validateTableUrl(config.tableUrl) ? '请先输入有效的表格链接' : '更新表格元数据'}
            >
              更新表格
            </button>
          </div>
        </div>

        {/* 同步字段配置 */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <h2 className="text-md font-medium text-gray-900 mb-4">同步字段配置</h2>
          
          <div className="space-y-3">
            {Object.entries(FIELD_CATEGORIES).map(([categoryKey, category]) => {
              const isExpanded = expandedCategories[categoryKey];
              const categoryFields = Object.keys(category.fields);
              const selectedCount = categoryFields.filter(field => 
                config.syncFields[field as keyof FeishuConfig['syncFields']]
              ).length;
              const totalCount = categoryFields.length;
              const allSelected = selectedCount === totalCount;
              const someSelected = selectedCount > 0 && selectedCount < totalCount;

              return (
                <div key={categoryKey} className="border border-gray-200 rounded-lg">
                  {/* 类目头部 */}
                  <div 
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleCategory(categoryKey)}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">{category.icon}</span>
                      <span className="font-medium text-gray-900">{category.label}</span>
                      <span className="text-sm text-gray-500">
                        ({selectedCount}/{totalCount})
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* 全选/取消全选按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCategoryAll(categoryKey as keyof typeof FIELD_CATEGORIES, !allSelected);
                        }}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          allSelected 
                            ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        {allSelected ? '取消全选' : '全选'}
                      </button>
                      {/* 展开/收起图标 */}
                      <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* 字段列表 */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-3 bg-gray-50">
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(category.fields).map(([fieldKey, fieldLabel]) => {
                          const isEnabled = config.syncFields[fieldKey as keyof FeishuConfig['syncFields']];
                          const isNoteId = fieldKey === 'noteId';
                          const isDisabled = isNoteId; // 笔记ID不可修改
                          
                          return (
                            <label key={fieldKey} className={`flex items-center space-x-2 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                              <input
                                type="checkbox"
                                checked={isNoteId ? true : isEnabled} // 笔记ID始终选中
                                onChange={isDisabled ? undefined : () => handleFieldToggle(fieldKey as keyof FeishuConfig['syncFields'])}
                                disabled={isDisabled}
                                className={`w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${
                                  isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              />
                              <span className={`text-sm ${isDisabled ? 'text-gray-500' : 'text-gray-700'}`}>
                                {fieldLabel}
                                {isNoteId && <span className="text-xs text-blue-600 ml-1">(必选)</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
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
                <div className="mt-1 space-y-2">
                  {Object.entries(FIELD_CATEGORIES).map(([categoryKey, category]) => {
                    const selectedFields = Object.entries(category.fields).filter(([fieldKey, _]) => 
                      config.syncFields[fieldKey as keyof FeishuConfig['syncFields']]
                    );
                    
                    if (selectedFields.length === 0) return null;
                    
                    return (
                      <div key={categoryKey}>
                        <div className="text-xs text-gray-500 mb-1">
                          {category.icon} {category.label}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {selectedFields.map(([fieldKey, fieldLabel]) => (
                            <span key={fieldKey} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {fieldLabel}
                            </span>
                          ))}
                        </div>
                      </div>
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