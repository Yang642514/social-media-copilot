/**
 * 小红书助手 - 后台脚本
 */

// 笔记数据接口
interface NoteData {
  title: string;
  author: string;
  likes: number;
  comments: number;
  shares: number;
  publishTime: string;
  followerCount: number;
  images?: string[]; // 图片URL数组
  content?: string; // 笔记内容
}

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
    ipAddress: boolean;
    
    // 博主信息
    authorId: boolean;
    authorUrl: boolean;
    authorName: boolean;
    authorXhsId: boolean;
    followerCount: boolean;
    likesAndCollections: boolean;
    authorBio: boolean;
    
    // 其他
    imageCount: boolean;
    noteImages: boolean;
    videoCover: boolean;
    videoFile: boolean;
  };
}

export default defineBackground(() => {
  console.log('小红书助手后台脚本已加载');
  
  // 设置侧边栏行为，点击工具栏图标时打开
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('设置侧边栏行为失败:', error);
  });
  
  // 监听来自内容脚本的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggleSidebar') {
      // 打开侧边栏 - 添加tab有效性检查
      if (sender.tab?.id && sender.tab?.windowId) {
        // 先检查tab是否仍然有效
        chrome.tabs.get(sender.tab.id).then((tab) => {
          if (tab && tab.windowId) {
            chrome.sidePanel.open({ windowId: tab.windowId }).catch(error => {
              console.error('打开侧边栏失败:', error);
            });
          }
        }).catch(error => {
          console.error('Tab已无效:', error);
          // 尝试获取当前活动窗口
          chrome.windows.getCurrent().then(window => {
            if (window.id) {
              chrome.sidePanel.open({ windowId: window.id }).catch(err => {
                console.error('使用当前窗口打开侧边栏失败:', err);
              });
            }
          });
        });
      } else {
        // 如果没有有效的tab信息，尝试获取当前活动窗口
        chrome.windows.getCurrent().then(window => {
          if (window.id) {
            chrome.sidePanel.open({ windowId: window.id }).catch(error => {
              console.error('使用当前窗口打开侧边栏失败:', error);
            });
          }
        });
      }
    } else if (message.action === 'syncToFeishu') {
      // 处理同步到飞书的请求
      handleFeishuSync(message.data, message.config, message.currentUrl || '', sendResponse);
      return true; // 保持消息通道开放以进行异步响应
    } else if (message.action === 'createFeishuTable') {
      // 处理创建飞书多维表格的请求
      handleCreateFeishuTable(message.config, sendResponse);
      return true; // 保持消息通道开放以进行异步响应
    } else if (message.action === 'updateFeishuTable') {
      // 处理更新飞书多维表格的请求
      handleUpdateFeishuTable(message.config, message.updateData, sendResponse);
      return true; // 保持消息通道开放以进行异步响应
    } else if (message.action === 'testFeishuConnection') {
      // 处理测试飞书连接的请求
      handleTestFeishuConnection(message.config, sendResponse);
      return true; // 保持消息通道开放以进行异步响应
    }
  });

  // 验证飞书表格链接
  function validateFeishuTableUrl(url: string): { isValid: boolean; appToken?: string; tableId?: string } {
    // 支持多种飞书表格链接格式
    const patterns = [
      /https:\/\/[^.]+\.feishu\.cn\/base\/([A-Za-z0-9]+).*table=([A-Za-z0-9]+)/,
      /https:\/\/[^.]+\.feishu\.cn\/sheets\/([A-Za-z0-9]+).*table=([A-Za-z0-9]+)/,
      /https:\/\/[^.]+\.feishu\.cn\/base\/([A-Za-z0-9]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const [, appToken, tableId] = match;
        return {
          isValid: true,
          appToken,
          tableId: tableId || 'default' // 如果没有指定table，使用默认值
        };
      }
    }

    return { isValid: false };
  }

  // 处理飞书同步
  async function handleFeishuSync(noteData: NoteData, config: FeishuConfig, currentUrl: string, sendResponse: (response: any) => void) {
    try {
      // 验证配置
      if (!config || !config.appId || !config.appSecret) {
        sendResponse({ 
          success: false, 
          error: '请先在侧边栏配置飞书应用信息' 
        });
        return;
      }

      // 获取飞书访问令牌
      const accessToken = await getFeishuAccessToken(config.appId, config.appSecret);
      if (!accessToken) {
        sendResponse({ 
          success: false, 
          error: '获取飞书访问令牌失败，请检查App ID和App Secret' 
        });
        return;
      }

      // 验证表格链接
      const urlValidation = validateFeishuTableUrl(config.tableUrl);
      if (!urlValidation.isValid) {
        sendResponse({ 
          success: false, 
          error: '无效的飞书多维表格链接，请检查链接格式' 
        });
        return;
      }

      // 获取并验证多维表格元数据
      const metadataResult = await getFeishuAppMetadata(accessToken, urlValidation.appToken!);
      if (!metadataResult.success) {
        console.error('❌ 获取多维表格元数据失败:', metadataResult.error);
        sendResponse({ 
          success: false, 
          error: metadataResult.error 
        });
        return;
      }

      const metadata = metadataResult.data!;
      console.log(`✅ 多维表格验证成功 - ${metadata.name} (版本: ${metadata.revision})`);
      
      // 如果表格开启了高级权限，给出提示
      if (metadata.is_advanced) {
        console.log('⚠️ 注意：该多维表格已开启高级权限，请确保应用具有足够的访问权限');
      }

      // 准备同步数据
      const syncData = prepareSyncData(noteData, config.syncFields, currentUrl);

      // 检查并创建缺失的字段
      const requiredFields = Object.keys(syncData);
      console.log('准备检查字段:', requiredFields);
      
      const fieldsResult = await ensureTableFields(
        accessToken, 
        urlValidation.appToken!, 
        urlValidation.tableId!, 
        requiredFields
      );
      
      if (!fieldsResult.success) {
        console.error('❌ 字段检查失败:', fieldsResult.error);
        sendResponse({ 
          success: false, 
          error: `字段检查失败: ${fieldsResult.error}` 
        });
        return;
      }

      // 处理文件上传
      if (config.uploadFiles && noteData.images && noteData.images.length > 0) {
        try {
          const uploadedFiles = await uploadFilesToFeishu(accessToken, noteData.images);
          if (uploadedFiles.length > 0) {
            syncData['附件'] = uploadedFiles.join(', ');
            
            // 如果添加了附件字段，也需要确保该字段存在
            const attachmentFieldResult = await ensureTableFields(
              accessToken, 
              urlValidation.appToken!, 
              urlValidation.tableId!, 
              ['附件']
            );
            
            if (!attachmentFieldResult.success) {
              console.warn('创建附件字段失败:', attachmentFieldResult.error);
            }
          }
        } catch (error) {
          console.warn('文件上传失败:', error);
          // 文件上传失败不影响数据同步
        }
      }

      // 根据同步模式处理数据
      const syncResult = await syncToFeishuTable(
        accessToken, 
        urlValidation.appToken!, 
        urlValidation.tableId!, 
        syncData, 
        config.syncMode
      );
      
      if (syncResult.success) {
        sendResponse({ 
          success: true, 
          message: '数据已成功同步到飞书多维表格' 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: syncResult.error || '同步失败' 
        });
      }
    } catch (error) {
      console.error('飞书同步错误:', error);
      sendResponse({ 
        success: false, 
        error: '同步过程中发生错误：' + (error as Error).message 
      });
    }
  }

  // 根据飞书官方文档处理错误码
  function getFeishuErrorMessage(code: number, msg?: string): string {
    const errorMessages: Record<number, string> = {
      // 认证相关错误
      99991663: 'app_id 参数无效，请检查应用配置',
      99991664: 'app_secret 参数无效，请检查应用配置',
      99991665: '应用不存在或已被删除',
      99991666: '应用状态异常，请联系管理员',
      
      // 权限相关错误
      99991661: '应用权限不足，请检查应用权限配置',
      99991662: 'token 无效或已过期，请重新获取',
      
      // 请求相关错误
      1254000: '请求体格式错误，请检查JSON格式',
      1254001: '请求体参数错误，请检查必填参数',
      1254002: '内部错误，请稍后重试或联系技术支持',
      1254003: 'app_token错误，请检查多维表格链接',
      1254031: '多维表格名称格式错误，长度不能超过255个字符',
      1254036: '多维表格正在复制中，请稍后重试',
      1254040: 'app_token不存在，请检查多维表格是否有效',
      1254045: '字段不存在，系统已自动创建缺失字段，请重试同步',
      
      // 频率限制错误
      1254290: '请求过于频繁，请稍后重试',
      1254291: '存在并发写操作冲突，请稍后重试',
      
      // 权限设置错误
      1254301: '多维表格未开启高级权限或不支持开启高级权限',
      1254302: '无访问权限，可能是表格开启了高级权限，请在高级权限设置中添加应用权限',
      
      // 云空间相关错误
      1254701: '对目标云空间节点没有权限',
      1254702: '云空间节点不存在',
      
      // 字段相关错误
      1254046: '字段类型不支持',
      1254047: '字段名称重复',
      1254048: '字段数量超过限制',
      
      // 记录相关错误
      1254050: '记录不存在',
      1254051: '记录数量超过限制',
      1254052: '记录字段值格式错误',
      
      // 日期时间字段错误
      1254064: '日期时间字段格式错误，需要Unix时间戳格式',
      
      // 链接字段错误
      1254068: '链接字段格式错误，需要包含text和link属性的对象格式'
    };

    const errorMessage = errorMessages[code];
    if (errorMessage) {
      // 特殊处理日期格式错误
      if (code === 1254064) {
        return `${errorMessage} (错误码: ${code})\n建议：请检查发布时间和更新时间字段是否为有效的Unix时间戳格式。如果问题持续，请尝试重新获取笔记数据。`;
      }
      
      // 特殊处理链接字段格式错误
      if (code === 1254068) {
        return `${errorMessage} (错误码: ${code})\n建议：链接字段需要包含text和link属性的对象，例如：{"text": "笔记标题", "link": "https://example.com"}。系统已自动修复此问题，请重新尝试同步。`;
      }
      return `${errorMessage} (错误码: ${code})`;
    }
    
    // 根据错误码范围提供通用建议
    if (code >= 99991660 && code <= 99991670) {
      return `认证失败 (${code}): ${msg || '请检查App ID和App Secret配置'}`;
    } else if (code >= 1254000 && code <= 1254099) {
      return `请求参数错误 (${code}): ${msg || '请检查请求参数格式'}`;
    } else if (code >= 1254200 && code <= 1254299) {
      return `业务逻辑错误 (${code}): ${msg || '请检查业务逻辑'}`;
    } else if (code >= 1254300 && code <= 1254399) {
      return `权限错误 (${code}): ${msg || '请检查应用权限设置'}`;
    } else if (code >= 1254700 && code <= 1254799) {
      return `云空间错误 (${code}): ${msg || '请检查云空间权限'}`;
    }
    
    return `飞书API错误 (${code}): ${msg || '未知错误'}`;
  }

  // 获取多维表格元数据
  async function getFeishuAppMetadata(accessToken: string, appToken: string): Promise<{
    success: boolean;
    data?: {
      name: string;
      revision: number;
      is_advanced: boolean;
    };
    error?: string;
  }> {
    try {
      console.log('正在获取多维表格元数据...');
      const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      });

      if (!response.ok) {
        console.error('获取多维表格元数据HTTP请求失败:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('HTTP响应内容:', errorText);
        return {
          success: false,
          error: `获取多维表格元数据HTTP请求失败: ${response.status} ${response.statusText}`
        };
      }

      const result = await response.json();
      console.log('获取多维表格元数据API响应:', result);
      
      if (result.code !== 0) {
        console.error('❌ 获取多维表格元数据失败:', JSON.stringify(result, null, 2));
        const errorMessage = getFeishuErrorMessage(result.code, result.msg);
        return {
          success: false,
          error: errorMessage
        };
      }

      const appData = result.data?.app;
      if (!appData) {
        return {
          success: false,
          error: '多维表格元数据响应格式错误'
        };
      }

      console.log(`✅ 多维表格元数据获取成功 - 名称: ${appData.name}, 版本: ${appData.revision}, 高级权限: ${appData.is_advanced ? '已开启' : '未开启'}`);
      
      return {
        success: true,
        data: {
          name: appData.name,
          revision: appData.revision,
          is_advanced: appData.is_advanced
        }
      };
    } catch (error) {
      console.error('获取多维表格元数据时发生错误:', error);
      return {
        success: false,
        error: `获取多维表格元数据时发生错误: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 更新多维表格元数据
  async function updateFeishuAppMetadata(
    accessToken: string, 
    appToken: string, 
    updateData: {
      name?: string;
      isAdvanced?: boolean;
    }
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log('正在更新多维表格元数据...', updateData);
      
      // 构建请求体
      const requestBody: any = {};
      if (updateData.name !== undefined) {
        requestBody.name = updateData.name;
      }
      if (updateData.isAdvanced !== undefined) {
        requestBody.is_advanced = updateData.isAdvanced;
      }
      
      // 如果没有要更新的数据，直接返回
      if (Object.keys(requestBody).length === 0) {
        console.log('没有需要更新的数据');
        return { success: true };
      }
      
      const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('更新多维表格元数据HTTP请求失败:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('HTTP响应内容:', errorText);
        return {
          success: false,
          error: `更新多维表格元数据HTTP请求失败: ${response.status} ${response.statusText}`
        };
      }

      const result = await response.json();
      console.log('更新多维表格元数据API响应:', result);
      
      if (result.code !== 0) {
        console.error('❌ 更新多维表格元数据失败:', JSON.stringify(result, null, 2));
        const errorMessage = getFeishuErrorMessage(result.code, result.msg);
        return {
          success: false,
          error: errorMessage
        };
      }

      console.log('✅ 多维表格元数据更新成功');
      return { success: true };
      
    } catch (error) {
      console.error('更新多维表格元数据时发生错误:', error);
      return {
        success: false,
        error: `更新多维表格元数据时发生错误: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 获取飞书访问令牌
  async function getFeishuAccessToken(appId: string, appSecret: string): Promise<string | null> {
    try {
      console.log('正在获取飞书访问令牌...');
      
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret
        })
      });

      if (!response.ok) {
        console.error('HTTP请求失败:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('HTTP响应内容:', errorText);
        return null;
      }

      const data = await response.json();
      console.log('飞书API响应:', data);
      
      if (data.code === 0 && data.tenant_access_token) {
        console.log('✅ 成功获取飞书访问令牌');
        return data.tenant_access_token;
      } else {
        console.error('❌ 获取飞书访问令牌失败:', {
          code: data.code,
          msg: data.msg,
          error: data.error
        });
        const errorMessage = getFeishuErrorMessage(data.code, data.msg);
        console.error('错误详情:', errorMessage);
        return null;
      }
    } catch (error) {
      console.error('❌ 请求飞书访问令牌时出错:', error);
      return null;
    }
  }

  // 上传文件到飞书
  async function uploadFilesToFeishu(accessToken: string, imageUrls: string[]): Promise<string[]> {
    const uploadedFiles: string[] = [];

    for (const imageUrl of imageUrls) {
      try {
        // 下载图片
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        
        // 创建FormData
        const formData = new FormData();
        formData.append('file', imageBlob, 'image.jpg');
        formData.append('file_type', 'image');

        // 上传到飞书
        const uploadResponse = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });

        if (!uploadResponse.ok) {
          console.error('上传文件HTTP请求失败:', uploadResponse.status, uploadResponse.statusText);
          const errorText = await uploadResponse.text();
          console.error('HTTP响应内容:', errorText);
          continue;
        }

        const uploadResult = await uploadResponse.json();
        
        if (uploadResult.code === 0) {
          uploadedFiles.push(uploadResult.data.file_token);
        } else {
          console.error('上传文件API错误:', JSON.stringify(uploadResult, null, 2));
          const errorMessage = getFeishuErrorMessage(uploadResult.code, uploadResult.msg);
          console.error('错误详情:', errorMessage);
        }
      } catch (error) {
        console.warn('上传图片失败:', imageUrl, error);
      }
    }

    return uploadedFiles;
  }

  // 准备同步数据
  function prepareSyncData(noteData: NoteData, syncFields: FeishuConfig['syncFields'], currentUrl: string): Record<string, any> {
    const data: Record<string, any> = {};

    // 笔记ID作为第一列索引，始终包含（即使用户未选择）
    // 从URL中提取笔记ID，如果无法提取则使用标题+作者的组合
    let noteId = '';
    try {
      const urlMatch = currentUrl.match(/\/explore\/([a-f0-9]+)/);
      if (urlMatch) {
        noteId = urlMatch[1]; // 使用小红书的实际笔记ID
      } else {
        // 备用方案：使用标题和作者的哈希值
        const hashInput = noteData.title + '_' + noteData.author;
        noteId = btoa(hashInput).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
      }
    } catch (error) {
      // 最终备用方案
      noteId = (noteData.title + '_' + noteData.author).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0, 20);
    }
    data['笔记ID'] = noteId;

    // 笔记信息（按顺序添加）
    if (syncFields.noteUrl) data['笔记链接'] = {
      text: noteData.title || '小红书笔记',
      link: currentUrl
    };
    if (syncFields.noteType) data['笔记类型'] = noteData.noteType || '图文';
    if (syncFields.noteTitle) data['笔记标题'] = noteData.title;
    if (syncFields.noteContent) data['笔记内容'] = noteData.content || '';
    if (syncFields.noteTopic) data['笔记话题'] = noteData.topics || [];
    if (syncFields.likes) data['点赞量'] = parseInt(noteData.likes) || 0;
    if (syncFields.collections) data['收藏量'] = parseInt(noteData.collections) || 0;
    if (syncFields.comments) data['评论量'] = parseInt(noteData.comments) || 0;
    if (syncFields.shares) data['分享量'] = parseInt(noteData.shares) || 0;
    if (syncFields.publishTime) {
      // 发布时间改为日期格式（毫秒时间戳）
      const timestamp = parseInt(noteData.publishTime);
      data['发布时间'] = isNaN(timestamp) ? Date.now() : timestamp * 1000;
    }
    if (syncFields.updateTime) data['更新时间'] = Date.now(); // 日期格式（毫秒时间戳）
    if (syncFields.ipAddress) data['IP地址'] = ''; // 客户端无法获取真实IP

    // 博主信息
    if (syncFields.authorId) data['博主ID'] = noteData.author; // 使用作者名作为ID
    if (syncFields.authorUrl) data['博主链接'] = {
      text: noteData.author || '博主主页',
      link: noteData.authorUrl || ''
    };
    if (syncFields.authorName) data['博主昵称'] = noteData.author;
    if (syncFields.authorXhsId) data['小红书号'] = noteData.authorXhsId || '';
    if (syncFields.followerCount) data['粉丝数'] = parseInt(noteData.followerCount) || 0;
    if (syncFields.likesAndCollections) data['获赞与收藏'] = parseInt(noteData.likesAndCollections) || 0;
    if (syncFields.authorBio) data['博主简介'] = noteData.authorBio || '';

    // 其他
    if (syncFields.imageCount) data['图片数量'] = noteData.images?.length || 0;
    if (syncFields.noteImages) data['笔记图片'] = noteData.images?.join(', ') || '';
    if (syncFields.videoCover) data['视频封面'] = noteData.videoCover || '';
    if (syncFields.videoFile) data['视频文件'] = ''; // 无法直接获取视频文件URL

    // 添加同步时间
    data['同步时间'] = Date.now(); // Unix时间戳（毫秒）

    return data;
  }

  // 获取表格字段列表
  async function getTableFields(
    accessToken: string, 
    appToken: string, 
    tableId: string
  ): Promise<{ success: boolean; fields?: any[]; error?: string }> {
    try {
      console.log('正在获取表格字段列表...');
      
      const apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      });

      if (!response.ok) {
        console.error('获取字段列表HTTP请求失败:', response.status, response.statusText);
        return { 
          success: false, 
          error: `HTTP请求失败: ${response.status} ${response.statusText}` 
        };
      }

      const result = await response.json();
      console.log('获取字段列表API响应:', result);
      
      if (result.code === 0) {
        console.log(`✅ 成功获取字段列表，共 ${result.data?.items?.length || 0} 个字段`);
        return { 
          success: true, 
          fields: result.data?.items || [] 
        };
      } else {
        console.error('❌ 获取字段列表API错误:', JSON.stringify(result, null, 2));
        const errorMessage = getFeishuErrorMessage(result.code, result.msg);
        return { 
          success: false, 
          error: errorMessage 
        };
      }
    } catch (error) {
      console.error('❌ 获取字段列表时出错:', error);
      return { 
        success: false, 
        error: `网络请求失败: ${(error as Error).message}` 
      };
    }
  }

  // 创建表格字段
  async function createTableField(
    accessToken: string, 
    appToken: string, 
    tableId: string,
    fieldName: string,
    fieldType: string = 'text'
  ): Promise<{ success: boolean; field?: any; error?: string }> {
    try {
      console.log(`正在创建字段: ${fieldName} (类型: ${fieldType})`);
      
      const apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
      
      // 根据字段名确定字段类型
      let type = 1; // 默认为文本类型
      let property: any = {};
      
      // 根据字段名智能判断字段类型
      if (fieldName.includes('时间')) {
        type = 5; // 日期时间类型
        // 日期字段使用null作为property，让飞书使用默认配置
        property = null;
      } else if (fieldName.includes('量') || fieldName.includes('数') || fieldName.includes('级')) {
        type = 2; // 数字类型
        property = {
          formatter: '0'
        };
      } else if (fieldName.includes('链接') || fieldName.includes('URL')) {
        type = 15; // URL类型
        // URL类型使用空对象作为property
        property = null;
      } else {
        type = 1; // 文本类型
        property = {};
      }

      const requestBody: any = {
        field_name: fieldName,
        type: type
      };
      
      // 只有当property不为null时才添加到请求体中
      if (property !== null) {
        requestBody.property = property;
      }

      console.log('创建字段请求体:', requestBody);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('创建字段HTTP请求失败:', response.status, response.statusText);
        
        // 尝试获取详细的错误响应
        let errorDetails = '';
        try {
          const errorResponse = await response.text();
          console.error('API错误响应详情:', errorResponse);
          errorDetails = errorResponse;
        } catch (e) {
          console.error('无法读取错误响应:', e);
        }
        
        return { 
          success: false, 
          error: `HTTP请求失败: ${response.status} ${response.statusText}${errorDetails ? ` - 详情: ${errorDetails}` : ''}` 
        };
      }

      const result = await response.json();
      console.log('创建字段API响应:', result);
      
      if (result.code === 0) {
        console.log(`✅ 成功创建字段: ${fieldName}`);
        return { 
          success: true, 
          field: result.data?.field 
        };
      } else {
        console.error('❌ 创建字段API错误:', JSON.stringify(result, null, 2));
        const errorMessage = getFeishuErrorMessage(result.code, result.msg);
        return { 
          success: false, 
          error: errorMessage 
        };
      }
    } catch (error) {
      console.error('❌ 创建字段时出错:', error);
      return { 
        success: false, 
        error: `网络请求失败: ${(error as Error).message}` 
      };
    }
  }

  // 检查并创建缺失的字段
  async function ensureTableFields(
    accessToken: string, 
    appToken: string, 
    tableId: string,
    requiredFields: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('正在检查表格字段...');
      
      // 获取现有字段
      const fieldsResult = await getTableFields(accessToken, appToken, tableId);
      if (!fieldsResult.success) {
        return { 
          success: false, 
          error: `获取字段列表失败: ${fieldsResult.error}` 
        };
      }

      const existingFields = fieldsResult.fields || [];
      const existingFieldNames = existingFields.map((field: any) => field.field_name);
      
      console.log('现有字段:', existingFieldNames);
      console.log('需要的字段:', requiredFields);

      // 找出缺失的字段
      const missingFields = requiredFields.filter(fieldName => 
        !existingFieldNames.includes(fieldName)
      );

      if (missingFields.length === 0) {
        console.log('✅ 所有字段都已存在');
        return { success: true };
      }

      console.log(`需要创建 ${missingFields.length} 个字段:`, missingFields);

      // 创建缺失的字段
      for (const fieldName of missingFields) {
        const createResult = await createTableField(accessToken, appToken, tableId, fieldName);
        if (!createResult.success) {
          console.error(`创建字段 ${fieldName} 失败:`, createResult.error);
          return { 
            success: false, 
            error: `创建字段 ${fieldName} 失败: ${createResult.error}` 
          };
        }
        
        // 添加延迟避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log('✅ 所有缺失字段已创建完成');
      return { success: true };
    } catch (error) {
      console.error('❌ 检查并创建字段时出错:', error);
      return { 
        success: false, 
        error: `检查字段失败: ${(error as Error).message}` 
      };
    }
  }

  // 检查记录是否已存在（用于合并模式）
  async function checkRecordExists(
    accessToken: string, 
    appToken: string, 
    tableId: string, 
    noteId: string
  ): Promise<string | null> {
    try {
      console.log(`检查记录是否存在: ${noteId}`);
      
      const apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          filter: {
            conditions: [{
              field_name: '笔记ID',
              operator: 'is',
              value: [noteId]
            }]
          }
        })
      });

      if (!response.ok) {
        console.error('检查记录HTTP请求失败:', response.status, response.statusText);
        return null;
      }

      const result = await response.json();
      console.log('检查记录API响应:', result);
      
      if (result.code === 0 && result.data?.items?.length > 0) {
        console.log(`找到现有记录: ${result.data.items[0].record_id}`);
        return result.data.items[0].record_id;
      }
      
      console.log('未找到现有记录');
      return null;
    } catch (error) {
      console.error('检查记录是否存在时出错:', error);
      return null;
    }
  }

  // 同步到飞书多维表格
  async function syncToFeishuTable(
    accessToken: string, 
    appToken: string,
    tableId: string,
    data: Record<string, any>,
    syncMode: FeishuConfig['syncMode']
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`正在同步数据到飞书多维表格 (模式: ${syncMode})...`);
      console.log('同步数据:', data);
      
      let apiUrl: string;
      let method: string;
      let body: any;

      switch (syncMode) {
        case 'append':
          // 追加模式：直接添加新记录
          apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
          method = 'POST';
          body = { fields: data };
          break;

        case 'merge':
          // 合并模式：检查是否存在，存在则更新，不存在则添加
          const existingRecordId = await checkRecordExists(accessToken, appToken, tableId, data['笔记ID']);
          
          if (existingRecordId) {
            // 更新现有记录
            apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${existingRecordId}`;
            method = 'PUT';
            body = { fields: data };
          } else {
            // 添加新记录
            apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
            method = 'POST';
            body = { fields: data };
          }
          break;

        case 'overwrite':
          // 覆盖模式：先清空表格，再添加新记录
          console.log('覆盖模式：正在清空表格...');
          await clearTableRecords(accessToken, appToken, tableId);
          apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
          method = 'POST';
          body = { fields: data };
          break;

        default:
          return { success: false, error: '不支持的同步模式' };
      }

      console.log(`发送请求到: ${apiUrl}`);
      console.log(`请求方法: ${method}`);
      console.log('请求体:', body);

      const response = await fetch(apiUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        console.error('HTTP请求失败:', response.status, response.statusText);
        return { 
          success: false, 
          error: `HTTP请求失败: ${response.status} ${response.statusText}` 
        };
      }

      const result = await response.json();
      console.log('飞书API响应:', result);
      
      if (result.code === 0) {
        console.log('✅ 数据同步成功');
        return { success: true };
      } else {
        console.error('❌ 飞书API错误:', JSON.stringify(result, null, 2));
        const errorMessage = getFeishuErrorMessage(result.code, result.msg);
        return { 
          success: false, 
          error: errorMessage
        };
      }
    } catch (error) {
      console.error('❌ 同步到飞书表格时出错:', error);
      return { 
        success: false, 
        error: `网络请求失败: ${(error as Error).message}` 
      };
    }
  }

  // 清空表格记录（用于覆盖模式）
  async function clearTableRecords(accessToken: string, appToken: string, tableId: string): Promise<void> {
    try {
      console.log('正在获取表格中的所有记录...');
      
      // 获取所有记录
      const listUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
      const listResponse = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      });

      if (!listResponse.ok) {
        console.error('获取记录HTTP请求失败:', listResponse.status, listResponse.statusText);
        return;
      }

      const listResult = await listResponse.json();
      console.log('获取记录API响应:', listResult);
      
      if (listResult.code === 0 && listResult.data?.items?.length > 0) {
        console.log(`找到 ${listResult.data.items.length} 条记录，正在删除...`);
        
        // 批量删除记录
        const recordIds = listResult.data.items.map((item: any) => item.record_id);
        
        const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_delete`;
        const deleteResponse = await fetch(deleteUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          records: recordIds
        })
      });

      if (!deleteResponse.ok) {
        console.error('删除记录HTTP请求失败:', deleteResponse.status, deleteResponse.statusText);
        const errorText = await deleteResponse.text();
        console.error('HTTP响应内容:', errorText);
        return;
      }

      const deleteResult = await deleteResponse.json();
      console.log('删除记录API响应:', deleteResult);
      
      if (deleteResult.code === 0) {
        console.log('✅ 表格记录清空成功');
      } else {
        console.error('❌ 删除记录失败:', JSON.stringify(deleteResult, null, 2));
        const errorMessage = getFeishuErrorMessage(deleteResult.code, deleteResult.msg);
        console.error('错误详情:', errorMessage);
      }
      } else {
        console.log('表格中没有记录需要清空');
      }
    } catch (error) {
      console.error('❌ 清空表格记录时出错:', error);
    }
  }

  // 处理创建飞书多维表格
  async function handleCreateFeishuTable(config: { appId: string; appSecret: string }, sendResponse: (response: any) => void) {
    try {
      // 验证配置
      if (!config || !config.appId || !config.appSecret) {
        sendResponse({ 
          success: false, 
          error: '请先填写App ID和App Secret' 
        });
        return;
      }

      // 获取飞书访问令牌
      const accessToken = await getFeishuAccessToken(config.appId, config.appSecret);
      if (!accessToken) {
        sendResponse({ 
          success: false, 
          error: '获取飞书访问令牌失败，请检查App ID和App Secret' 
        });
        return;
      }

      // 创建多维表格应用
      console.log('正在创建飞书多维表格...');
      const createAppResponse = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          name: '小红书笔记数据表',
          time_zone: 'Asia/Shanghai' // 设置中国时区
        })
      });

      if (!createAppResponse.ok) {
        console.error('创建多维表格HTTP请求失败:', createAppResponse.status, createAppResponse.statusText);
        const errorText = await createAppResponse.text();
        console.error('HTTP响应内容:', errorText);
        sendResponse({ 
          success: false, 
          error: `创建多维表格HTTP请求失败: ${createAppResponse.status} ${createAppResponse.statusText}` 
        });
        return;
      }

      const createAppResult = await createAppResponse.json();
      console.log('创建多维表格API响应:', createAppResult);
      
      // 根据官方文档处理错误码
      if (createAppResult.code !== 0) {
        console.error('❌ 创建多维表格失败:', JSON.stringify(createAppResult, null, 2));
        const errorMessage = getFeishuErrorMessage(createAppResult.code, createAppResult.msg);
        sendResponse({ 
          success: false, 
          error: errorMessage
        });
        return;
      }

      // 根据官方文档，正确解析响应数据结构
      if (!createAppResult.data?.app?.app_token) {
        console.error('❌ 多维表格响应数据格式错误:', JSON.stringify(createAppResult, null, 2));
        sendResponse({ 
          success: false, 
          error: '多维表格响应数据格式错误，缺少app_token' 
        });
        return;
      }

      const appToken = createAppResult.data.app.app_token;
      const appUrl = createAppResult.data.app.url;
      const defaultTableId = createAppResult.data.app.default_table_id;
      
      console.log(`✅ 多维表格创建成功 - AppToken: ${appToken}`);

      // 优先使用创建时返回的默认表格ID，如果没有则获取表格列表
      let tableId = defaultTableId;
      
      if (!tableId) {
        console.log('未获取到默认表格ID，正在获取表格列表...');
        const tablesResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8'
          }
        });

        if (!tablesResponse.ok) {
          console.error('获取表格列表HTTP请求失败:', tablesResponse.status, tablesResponse.statusText);
          const errorText = await tablesResponse.text();
          console.error('HTTP响应内容:', errorText);
          sendResponse({ 
            success: false, 
            error: `获取表格列表HTTP请求失败: ${tablesResponse.status} ${tablesResponse.statusText}` 
          });
          return;
        }

        const tablesResult = await tablesResponse.json();
        console.log('获取表格列表API响应:', tablesResult);
        
        if (tablesResult.code !== 0) {
          console.error('❌ 获取表格列表失败:', JSON.stringify(tablesResult, null, 2));
          const errorMessage = getFeishuErrorMessage(tablesResult.code, tablesResult.msg);
          sendResponse({ 
            success: false, 
            error: errorMessage
          });
          return;
        }

        if (!tablesResult.data?.items?.length) {
          console.error('❌ 多维表格中没有找到表格');
          sendResponse({ 
            success: false, 
            error: '多维表格中没有找到表格' 
          });
          return;
        }

        tableId = tablesResult.data.items[0].table_id;
      }
      
      console.log(`✅ 获取到表格ID: ${tableId}`);

      // 创建字段结构 - 根据用户要求更新字段类型
      const fields = [
        // 笔记信息
        { field_name: '笔记ID', field_type: 1 }, // 文本
        { field_name: '笔记链接', field_type: 15 }, // 超链接
        { field_name: '笔记类型', field_type: 3 }, // 单选
        { field_name: '笔记标题', field_type: 1 }, // 文本
        { field_name: '笔记内容', field_type: 1 }, // 文本
        { field_name: '笔记话题', field_type: 4 }, // 多选
        { field_name: '点赞量', field_type: 2 }, // 数字（千分位格式）
        { field_name: '收藏量', field_type: 2 }, // 数字（千分位格式）
        { field_name: '评论量', field_type: 2 }, // 数字（千分位格式）
        { field_name: '分享量', field_type: 2 }, // 数字（千分位格式）
        { field_name: '发布时间', field_type: 5 }, // 日期
        { field_name: '更新时间', field_type: 5 }, // 日期
        { field_name: 'IP地址', field_type: 1 }, // 文本
        
        // 博主信息
        { field_name: '博主ID', field_type: 1 }, // 文本
        { field_name: '博主昵称', field_type: 1 }, // 文本
        { field_name: '博主链接', field_type: 15 }, // 超链接
        { field_name: '小红书号', field_type: 1 }, // 文本
        { field_name: '粉丝数', field_type: 2 }, // 数字（千分位格式）
        { field_name: '获赞与收藏', field_type: 2 }, // 数字（千分位格式）
        { field_name: '博主简介', field_type: 1 }, // 文本
        
        // 其他信息
        { field_name: '图片数量', field_type: 2 }, // 数字（整数格式）
        { field_name: '笔记图片', field_type: 1 }, // 文本
        { field_name: '视频封面', field_type: 1 }, // 文本
        { field_name: '附件', field_type: 1 } // 文本
      ];

      // 批量创建字段
      for (const field of fields) {
        try {
          await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(field)
          });
        } catch (error) {
          console.warn(`创建字段 ${field.field_name} 失败:`, error);
        }
      }

      // 构建表格链接
      const tableUrl = `${appUrl}?table=${tableId}`;

      sendResponse({ 
        success: true, 
        tableUrl: tableUrl,
        appToken: appToken,
        tableId: tableId,
        message: '多维表格创建成功！' 
      });

    } catch (error) {
      console.error('创建飞书多维表格错误:', error);
      sendResponse({ 
        success: false, 
        error: '创建过程中发生错误：' + (error as Error).message 
      });
    }
  }

  // 处理更新飞书多维表格
  async function handleUpdateFeishuTable(
    config: { appId: string; appSecret: string; tableUrl: string }, 
    updateData: { name?: string; isAdvanced?: boolean },
    sendResponse: (response: any) => void
  ) {
    try {
      // 验证配置
      if (!config || !config.appId || !config.appSecret) {
        sendResponse({ 
          success: false, 
          error: '请先填写App ID和App Secret' 
        });
        return;
      }

      if (!config.tableUrl) {
        sendResponse({ 
          success: false, 
          error: '请先填写表格链接' 
        });
        return;
      }

      // 验证表格链接并提取app_token
      const urlValidation = validateFeishuTableUrl(config.tableUrl);
      if (!urlValidation.isValid || !urlValidation.appToken) {
        sendResponse({ 
          success: false, 
          error: '表格链接格式不正确，请检查链接是否为有效的飞书多维表格链接' 
        });
        return;
      }

      const appToken = urlValidation.appToken;

      // 获取飞书访问令牌
      const accessToken = await getFeishuAccessToken(config.appId, config.appSecret);
      if (!accessToken) {
        sendResponse({ 
          success: false, 
          error: '获取飞书访问令牌失败，请检查App ID和App Secret' 
        });
        return;
      }

      // 更新多维表格元数据
      const updateResult = await updateFeishuAppMetadata(accessToken, appToken, updateData);
      
      if (updateResult.success) {
        sendResponse({ 
          success: true, 
          message: '多维表格更新成功！' 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: updateResult.error || '更新失败' 
        });
      }

    } catch (error) {
      console.error('更新飞书多维表格错误:', error);
      sendResponse({ 
        success: false, 
        error: '更新过程中发生错误：' + (error as Error).message 
      });
    }
  }

  // 测试飞书连接
  async function handleTestFeishuConnection(
    config: { appId: string; appSecret: string; tableUrl: string },
    sendResponse: (response: any) => void
  ) {
    try {
      console.log('🔄 开始测试飞书连接...');
      const testResults: any[] = [];

      // 1. 验证配置完整性
      testResults.push({
        step: '配置验证',
        status: 'testing',
        message: '检查配置完整性...'
      });

      if (!config || !config.appId || !config.appSecret) {
        testResults[0].status = 'failed';
        testResults[0].message = '配置不完整：缺少App ID或App Secret';
        sendResponse({ 
          success: false, 
          error: '请先填写完整的App ID和App Secret',
          testResults 
        });
        return;
      }

      if (!config.tableUrl) {
        testResults[0].status = 'failed';
        testResults[0].message = '配置不完整：缺少表格链接';
        sendResponse({ 
          success: false, 
          error: '请先填写表格链接',
          testResults 
        });
        return;
      }

      testResults[0].status = 'passed';
      testResults[0].message = '配置完整性检查通过';

      // 2. 验证表格链接格式
      testResults.push({
        step: '链接格式验证',
        status: 'testing',
        message: '验证表格链接格式...'
      });

      const urlValidation = validateFeishuTableUrl(config.tableUrl);
      if (!urlValidation.isValid) {
        testResults[1].status = 'failed';
        testResults[1].message = '表格链接格式无效';
        sendResponse({ 
          success: false, 
          error: '无效的飞书多维表格链接，请检查链接格式',
          testResults 
        });
        return;
      }

      testResults[1].status = 'passed';
      testResults[1].message = `链接格式正确 (app_token: ${urlValidation.appToken?.substring(0, 8)}...)`;

      // 3. 测试获取访问令牌
      testResults.push({
        step: '获取访问令牌',
        status: 'testing',
        message: '正在获取飞书访问令牌...'
      });

      const accessToken = await getFeishuAccessToken(config.appId, config.appSecret);
      if (!accessToken) {
        testResults[2].status = 'failed';
        testResults[2].message = '获取访问令牌失败，请检查App ID和App Secret';
        sendResponse({ 
          success: false, 
          error: '获取飞书访问令牌失败，请检查App ID和App Secret',
          testResults 
        });
        return;
      }

      testResults[2].status = 'passed';
      testResults[2].message = '访问令牌获取成功';

      // 4. 测试多维表格访问
      testResults.push({
        step: '表格访问测试',
        status: 'testing',
        message: '测试多维表格访问权限...'
      });

      const metadataResult = await getFeishuAppMetadata(accessToken, urlValidation.appToken!);
      if (!metadataResult.success) {
        testResults[3].status = 'failed';
        testResults[3].message = `表格访问失败: ${metadataResult.error}`;
        sendResponse({ 
          success: false, 
          error: `无法访问多维表格: ${metadataResult.error}`,
          testResults 
        });
        return;
      }

      testResults[3].status = 'passed';
      testResults[3].message = `表格访问成功 (${metadataResult.data?.name})`;

      // 5. 测试字段列表获取
      testResults.push({
        step: '字段列表获取',
        status: 'testing',
        message: '获取表格字段列表...'
      });

      const fieldsResult = await getTableFields(accessToken, urlValidation.appToken!, urlValidation.tableId!);
      if (!fieldsResult.success) {
        testResults[4].status = 'failed';
        testResults[4].message = `字段列表获取失败: ${fieldsResult.error}`;
        sendResponse({ 
          success: false, 
          error: `无法获取字段列表: ${fieldsResult.error}`,
          testResults 
        });
        return;
      }

      testResults[4].status = 'passed';
      testResults[4].message = `字段列表获取成功 (共${fieldsResult.fields?.length || 0}个字段)`;

      // 所有测试通过
      console.log('✅ 飞书连接测试全部通过');
      sendResponse({ 
        success: true, 
        message: '飞书连接测试全部通过，配置正确！',
        testResults,
        tableInfo: {
          name: metadataResult.data?.name,
          fieldsCount: fieldsResult.fields?.length || 0,
          isAdvanced: metadataResult.data?.is_advanced
        }
      });

    } catch (error) {
      console.error('❌ 测试飞书连接时出错:', error);
      sendResponse({ 
        success: false, 
        error: `测试过程中发生错误: ${(error as Error).message}` 
      });
    }
  }
});
