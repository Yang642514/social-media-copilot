import { defineContentScript } from 'wxt/sandbox';

// 全局变量声明
declare let urlChangeObserver: MutationObserver | undefined;
declare let modalObserver: MutationObserver | undefined;

// 笔记数据接口
interface NoteData {
  title: string;
  author: string;
  authorUrl?: string;        // 博主链接
  authorBio?: string;        // 博主简介
  likes: number;
  comments: number;
  shares: number;
  collections?: number;      // 收藏量
  publishTime: string;
  recommendLevel: 'high' | 'medium' | 'low';
  likeFollowRatio: number;
  followerCount: number;
  likesAndCollections?: string; // 获赞与收藏
  noteScore: number;
  content?: string;          // 笔记文本内容
  tags?: string[];           // 笔记标签数组
  topics?: string[];         // 笔记话题
  noteType?: string;         // 笔记类型（图文/视频）
  videoCover?: string;       // 视频封面
  noteUrl?: string;          // 笔记链接
  updateTime?: string;        // 更新时间
}

export default defineContentScript({
  matches: ['*://*.xiaohongshu.com/*'],
  runAt: 'document_end', // 确保DOM加载完成后执行
  main() {
    // 检查扩展上下文是否有效
    function isExtensionContextValid(): boolean {
      try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
      } catch (error) {
        console.warn('⚠️ Extension context invalidated:', error);
        return false;
      }
    }

    // 扩展上下文失效处理
    let contextInvalidated = false;
    function handleContextInvalidation() {
      if (contextInvalidated) return;
      contextInvalidated = true;
      
      console.warn('⚠️ 扩展上下文已失效，清理资源并准备重新初始化');
      
      // 清理现有的监听器和按钮
      try {
        if (typeof urlChangeObserver !== 'undefined') {
          urlChangeObserver.disconnect();
        }
        if (typeof modalObserver !== 'undefined') {
          modalObserver.disconnect();
        }
        
        // 移除所有功能按钮
        const existingButtons = document.querySelectorAll('.xhs-helper-buttons');
        existingButtons.forEach(btn => btn.remove());
      } catch (error) {
        console.error('清理资源时出错:', error);
      }
      
      // 延迟重新初始化，等待扩展重新加载
      setTimeout(() => {
        if (isExtensionContextValid()) {
          console.log('🔄 扩展上下文已恢复，重新初始化');
          contextInvalidated = false;
          // 重新初始化
          location.reload();
        }
      }, 2000);
    }

    // 安全的chrome API调用包装器
    function safeRuntimeSendMessage(message: any): Promise<any> {
      return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
          reject(new Error('Extension context invalidated'));
          return;
        }

        try {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    }
    // 显示使用提示（替代侧边栏切换按钮）
    function showUsageTip() {
      // 检查是否已显示过提示
      if (localStorage.getItem('xhs-helper-tip-shown')) return;
      
      // 创建提示元素
      const tipElement = document.createElement('div');
      tipElement.className = 'xhs-helper-tip';
      tipElement.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #ff2442, #ff6b6b);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(255, 36, 66, 0.3);
          z-index: 10000;
          font-size: 14px;
          font-weight: 500;
          max-width: 280px;
          animation: slideIn 0.3s ease-out;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>🎉</span>
            <span>点击浏览器工具栏的扩展图标打开小红书助手</span>
            <button onclick="this.parentElement.parentElement.parentElement.remove(); localStorage.setItem('xhs-helper-tip-shown', 'true');" 
                    style="background: none; border: none; color: white; cursor: pointer; font-size: 16px; margin-left: auto;">×</button>
          </div>
        </div>
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        </style>
      `;
      
      document.body.appendChild(tipElement);
      
      // 5秒后自动隐藏
      setTimeout(() => {
        if (tipElement.parentNode) {
          tipElement.remove();
          localStorage.setItem('xhs-helper-tip-shown', 'true');
        }
      }, 5000);
    }

    // 创建功能按钮组件
    // 创建功能按钮容器（优化版本：快速加载，左上角排版）
    function createFunctionButtons(): HTMLElement {
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'xhs-helper-buttons';
      
      // 按钮容器样式：水平排列，紧凑布局，左对齐
      buttonContainer.style.cssText = `
        position: relative;
        display: flex;
        flex-direction: row;
        gap: 6px;
        margin: 4px 0 6px 0;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
        justify-content: flex-start;
        align-items: center;
      `;

      // 创建操作按钮的辅助函数
      const createActionButton = (text: string, color: string, onClick: () => void) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        
        // 按钮样式：紧凑设计
        button.style.cssText = `
          background: ${color};
          color: #fff;
          border: none;
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          min-width: 70px;
          text-align: center;
          line-height: 1.2;
        `;

        // 悬停效果
        button.addEventListener('mouseenter', () => {
          button.style.opacity = '0.8';
        });

        button.addEventListener('mouseleave', () => {
          button.style.opacity = '1';
        });

        button.addEventListener('click', onClick);
        return button;
      };

      // 按照要求的顺序创建按钮：复制笔记、同步飞书
      const copyButton = createActionButton('复制笔记', '#52c41a', handleCopyNote);
      const syncButton = createActionButton('同步飞书', '#3d61ff', handleSyncNote);

      buttonContainer.appendChild(copyButton);
      buttonContainer.appendChild(syncButton);

      return buttonContainer;
    }



    // 更新数据显示
    function updateDataDisplay(): void {
      try {
        const noteData = extractNoteData();
        
        // 更新粉丝量显示
        const followerDisplay = document.querySelector('#follower-count-display span:last-child') as HTMLElement;
        if (followerDisplay) {
          followerDisplay.textContent = formatNumber(noteData.followerCount);
        }

        // 更新赞粉比显示
        const ratioDisplay = document.querySelector('#like-follow-ratio-display span:last-child') as HTMLElement;
        if (ratioDisplay) {
          ratioDisplay.textContent = (noteData.likeFollowRatio * 100).toFixed(2) + '%';
        }

        console.log('数据显示已更新:', noteData);
      } catch (error) {
        console.error('更新数据显示失败:', error);
      }
    }

    // 格式化数字显示
    function formatNumber(num: number): string {
      if (num >= 10000) {
        return (num / 10000).toFixed(1) + 'w';
      } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
      }
      return num.toString();
    }

    // 显示同步选项 (占位函数)
    function showSyncOptions(): void {
      showMessage('同步选项功能开发中...', 'info');
    }

    // 显示复制选项 (占位函数)
    function showCopyOptions(): void {
      showMessage('复制选项功能开发中...', 'info');
    }

    // 从页面JavaScript数据中获取真实数据
    function extractDataFromPageScript(): any {
      try {
        console.log('🔍 开始提取页面JavaScript数据...');
        
        // 1. 尝试从window对象中获取数据（扩展更多可能的属性）
        const windowKeys = [
          '__INITIAL_STATE__',
          '__NUXT__', 
          '__NEXT_DATA__',
          'initialState',
          'pageData',
          'appData',
          'noteData',
          'userInfo',
          'globalData',
          'reduxStore',
          'store',
          'state',
          '__APOLLO_STATE__',
          '__PRELOADED_STATE__'
        ];
        
        for (const key of windowKeys) {
          const windowData = (window as any)[key];
          if (windowData && typeof windowData === 'object') {
            console.log(`✅ 从window.${key}获取到数据`);
            return windowData;
          }
        }

        // 2. 尝试从script标签中获取JSON数据
        const scriptTags = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]');
        for (const script of scriptTags) {
          try {
            const data = JSON.parse(script.textContent || '');
            if (data && typeof data === 'object') {
              console.log('✅ 从JSON script标签获取到数据');
              return data;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }

        // 3. 尝试从其他script标签中获取数据（增强模式匹配）
        const allScripts = document.querySelectorAll('script');
        for (const script of allScripts) {
          const content = script.textContent || '';
          
          // 跳过太短的script
          if (content.length < 100) continue;
          
          // 查找包含数据的script（扩展匹配模式）
          const dataPatterns = [
            'window.__INITIAL_STATE__',
            'window.initialState',
            'window.__NUXT__',
            'window.__NEXT_DATA__',
            '"noteId"',
            '"likeCount"',
            '"commentCount"',
            '"shareCount"',
            '"collectCount"',
            '"interactInfo"',
            '"stats"',
            '"noteDetail"',
            '"userInfo"'
          ];
          
          const hasDataPattern = dataPatterns.some(pattern => content.includes(pattern));
          
          if (hasDataPattern) {
            try {
              // 尝试多种提取模式
              const extractPatterns = [
                /window\.__INITIAL_STATE__\s*=\s*({.+?});/,
                /window\.initialState\s*=\s*({.+?});/,
                /window\.__NUXT__\s*=\s*({.+?});/,
                /window\.__NEXT_DATA__\s*=\s*({.+?});/,
                /({.*"noteId".*"likeCount".*})/,
                /({.*"interactInfo".*})/,
                /({.*"stats".*"likeCount".*})/,
                /({.*"noteDetail".*})/
              ];
              
              for (const pattern of extractPatterns) {
                const match = content.match(pattern);
                if (match) {
                  try {
                    const data = JSON.parse(match[1]);
                    console.log('✅ 从script标签提取到数据');
                    return data;
                  } catch (parseError) {
                    // 尝试修复常见的JSON格式问题
                    let fixedJson = match[1]
                      .replace(/,\s*}/g, '}')  // 移除尾随逗号
                      .replace(/,\s*]/g, ']')  // 移除数组尾随逗号
                      .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // 给属性名加引号
                    
                    try {
                      const data = JSON.parse(fixedJson);
                      console.log('✅ 修复JSON格式后提取到数据');
                      return data;
                    } catch (e) {
                      // 继续尝试下一个模式
                    }
                  }
                }
              }
            } catch (e) {
              // 忽略解析错误，继续下一个script
            }
          }
        }

        // 4. 尝试从React/Vue组件中获取数据
        const reactRoot = document.querySelector('[data-reactroot]');
        if (reactRoot) {
          console.log('🔍 检测到React应用，尝试获取组件数据');
          // 尝试获取React组件的数据
          const reactInstance = (reactRoot as any)._reactInternalFiber || 
                               (reactRoot as any)._reactInternalInstance ||
                               (reactRoot as any).__reactInternalInstance;
          if (reactInstance) {
            console.log('✅ 找到React实例');
            // 这里可以进一步探索React组件树
          }
        }

        console.log('❌ 未能从JavaScript中提取到数据');
      } catch (error) {
        console.warn('❌ 提取页面数据失败:', error);
      }
      return null;
     }

    // 在复杂对象中查找笔记数据
    function findNoteDataInObject(obj: any): any {
      if (!obj || typeof obj !== 'object') return null;
      
      console.log('🔍 开始在对象中搜索笔记数据...');
      
      // 递归查找包含笔记数据的对象
      function searchObject(current: any, depth = 0, path = ''): any {
        if (depth > 15) return null; // 增加搜索深度
        
        if (current && typeof current === 'object') {
          // 检查是否包含笔记相关字段
          const hasNoteId = current.noteId || current.id || current.note_id || current.itemId;
          const hasTitle = current.title || current.desc || current.description;
          const hasInteractData = current.likeCount !== undefined || 
                                 current.commentCount !== undefined ||
                                 current.shareCount !== undefined ||
                                 current.collectCount !== undefined ||
                                 current.interactInfo ||
                                 current.stats ||
                                 current.engagement ||
                                 current.metrics;

          if ((hasNoteId || hasTitle) && hasInteractData) {
            console.log(`✅ 在路径 ${path} 找到笔记数据`);
            return current;
          }

          // 检查特定的数据路径（优先搜索）
          const priorityPaths = [
            'noteDetail', 'note', 'item', 'data', 'content', 'detail', 'info',
            'props', 'pageProps', 'initialProps', 'serverData', 'hydrationData',
            'noteInfo', 'itemInfo', 'feedItem', 'cardInfo'
          ];

          for (const priorityPath of priorityPaths) {
            if (current[priorityPath] && typeof current[priorityPath] === 'object') {
              const result = searchObject(current[priorityPath], depth + 1, `${path}.${priorityPath}`);
              if (result) return result;
            }
          }

          // 如果是数组，搜索数组中的每个元素
          if (Array.isArray(current)) {
            for (let i = 0; i < Math.min(current.length, 50); i++) { // 限制数组搜索数量
              const result = searchObject(current[i], depth + 1, `${path}[${i}]`);
              if (result) return result;
            }
          }
          
          // 递归搜索其他子对象
          for (const key in current) {
            if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
              // 跳过已经搜索过的优先路径
              if (!priorityPaths.includes(key)) {
                const result = searchObject(current[key], depth + 1, `${path}.${key}`);
                if (result) return result;
              }
            }
          }
        }
        return null;
      }
      
      const result = searchObject(obj, 0, 'root');
      if (!result) {
        console.log('❌ 未在对象中找到笔记数据');
      }
      return result;
    }

    // 尝试触发悬浮窗并提取数据
    function tryExtractFromHoverCard(): { author?: string; followerCount?: number; likesAndCollections?: string } {
      const result: { author?: string; followerCount?: number; likesAndCollections?: string } = {};
      
      // 查找可能触发悬浮窗的元素
      const hoverTriggers = [
        '.author-container',
        '.user-info',
        '.author-wrapper',
        '.user-avatar',
        '.author-avatar',
        '.user-name',
        '.author-name',
        '.nickname',
        '[data-testid="author"]',
        '.profile-link'
      ];
      
      for (const triggerSelector of hoverTriggers) {
        const triggerElement = document.querySelector(triggerSelector);
        if (triggerElement) {
          try {
            // 模拟鼠标悬浮
            const mouseEnterEvent = new MouseEvent('mouseenter', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            triggerElement.dispatchEvent(mouseEnterEvent);
            
            // 等待悬浮窗出现
            setTimeout(() => {
              // 检查是否有悬浮窗出现
              const hoverCard = document.querySelector('.hover-card, .user-hover-card, .author-hover, .popup-card, .tooltip, .user-card, .author-card');
              if (hoverCard) {
                console.log('✅ 检测到悬浮窗，尝试提取数据');
                
                // 提取博主名称
                const nameElement = hoverCard.querySelector('.name, .nickname, .username');
                if (nameElement?.textContent?.trim()) {
                  result.author = nameElement.textContent.trim();
                  console.log(`✅ 从悬浮窗获取博主名称: ${result.author}`);
                }
                
                // 提取粉丝数
                const followerElement = hoverCard.querySelector('.follower-count, .fans-count, .fans, .followers');
                if (followerElement?.textContent?.trim()) {
                  result.followerCount = parseNumber(followerElement.textContent.trim());
                  console.log(`✅ 从悬浮窗获取粉丝数: ${result.followerCount}`);
                }
                
                // 提取获赞与收藏
                const likesElement = hoverCard.querySelector('.total-likes, .total-engagement, .likes-and-collections');
                if (likesElement?.textContent?.trim()) {
                  result.likesAndCollections = likesElement.textContent.trim();
                  console.log(`✅ 从悬浮窗获取获赞与收藏: ${result.likesAndCollections}`);
                }
              }
            }, 100); // 等待100ms让悬浮窗出现
            
            break; // 找到第一个可触发的元素就停止
          } catch (error) {
            console.warn(`⚠️ 触发悬浮窗时出错 (${triggerSelector}):`, error);
          }
        }
      }
      
      return result;
    }

    // 时间戳转换辅助函数
    function convertToTimestamp(timeValue: any): string {
      try {
        if (!timeValue) return '';
        
        // 如果已经是时间戳格式
        if (typeof timeValue === 'number') {
          return timeValue.toString();
        }
        
        // 如果是字符串，尝试转换为Date对象
        if (typeof timeValue === 'string') {
          const date = new Date(timeValue);
          if (!isNaN(date.getTime())) {
            return date.getTime().toString();
          }
        }
        
        return '';
      } catch (error) {
        console.warn('⚠️ 时间戳转换失败:', error);
        return '';
      }
    }

    // 提取笔记数据
    function extractNoteData(): NoteData {
      // 首先尝试从悬浮窗获取数据
      console.log('🔍 尝试从悬浮窗获取博主信息...');
      const hoverCardData = tryExtractFromHoverCard();
      
      // 然后尝试从页面JavaScript数据中获取
      let jsData: any = null;
      
      try {
        const pageData = extractDataFromPageScript();
        if (pageData) {
          // 尝试找到笔记数据
          jsData = findNoteDataInObject(pageData);
        }
      } catch (error) {
        console.warn('⚠️ 提取页面JavaScript数据时出错:', error);
        jsData = null;
      }
      
      // 确保jsData始终有一个安全的默认值
      if (!jsData) {
        jsData = {};
      }

      // 获取标题
      let title = '';
      if (jsData?.title) {
        title = jsData.title;
      } else {
        const titleElement = document.querySelector('#detail-title') || 
                        document.querySelector('[data-testid="note-title"]') ||
                        document.querySelector('.note-detail-title') ||
                        document.querySelector('h1');
        title = titleElement?.textContent?.trim() || '未知标题';
      }
    
      // 获取作者信息 - 优先从悬浮窗数据获取
      let author = '';
      console.log('🔍 开始提取作者信息...');
      
      // 优先使用悬浮窗数据
      if (hoverCardData.author) {
        author = hoverCardData.author;
        console.log(`✅ 从悬浮窗获取作者: ${author}`);
      }
      
      // 如果悬浮窗没有数据，尝试从JavaScript数据获取
      if (!author && jsData) {
        author = jsData.author || 
                jsData.authorName || 
                jsData.user?.name || 
                jsData.user?.nickname || 
                jsData.userInfo?.name ||
                jsData.userInfo?.nickname ||
                '';
        if (author) {
          console.log(`✅ 从JS数据获取作者: ${author}`);
        }
      }
      
      if (!author) {
        // 尝试从悬浮窗中获取博主信息
        const hoverCardSelectors = [
          '.hover-card .name',
          '.user-hover-card .name',
          '.author-hover .name',
          '.popup-card .name',
          '.tooltip .name',
          '.user-card .name',
          '.author-card .name'
        ];
        
        // 常规选择器
        const authorSelectors = [
          '.author-container .name',
          '.user-info .name',
          '.note-detail-author .name',
          '.author-wrapper .name',
          '.user-name',
          '[data-testid="author-name"]',
          '.author-info .name',
          '.username',
          '.author-name',
          '.user-nickname',
          '.nickname'
        ];
        
        // 合并所有选择器，优先检查悬浮窗
        const allSelectors = [...hoverCardSelectors, ...authorSelectors];
        
        for (const selector of allSelectors) {
          const authorElement = document.querySelector(selector);
          if (authorElement?.textContent?.trim()) {
            author = authorElement.textContent.trim();
            console.log(`✅ 从${selector}获取博主名称: ${author}`);
            break;
          }
        }
        
        if (!author) {
          author = '未知作者';
        }
      }



      // 获取作者链接 - 优先从JavaScript数据获取
      let authorUrl = '';
      if (jsData) {
        authorUrl = jsData.authorLink || 
                   jsData.user?.link || 
                   jsData.user?.url ||
                   jsData.userInfo?.link ||
                   jsData.userInfo?.url ||
                   '';
        if (authorUrl && !authorUrl.startsWith('http')) {
          if (authorUrl.startsWith('/')) {
            authorUrl = 'https://www.xiaohongshu.com' + authorUrl;
          } else {
            authorUrl = 'https://www.xiaohongshu.com/' + authorUrl;
          }
        }
      }
      
      if (!authorUrl) {
        const authorLinkElement = document.querySelector('.author-container a') ||
                             document.querySelector('.user-info a') ||
                             document.querySelector('.note-detail-author a') ||
                             document.querySelector('.author-wrapper a') ||
                             document.querySelector('.user-name a') ||
                             document.querySelector('.author-info a') ||
                             document.querySelector('[data-testid="author-link"]') ||
                             document.querySelector('.author-name a') ||
                             document.querySelector('.user-nickname a') ||
                             document.querySelector('.nickname a');
        authorUrl = authorLinkElement?.getAttribute('href') || '';
        if (authorUrl && !authorUrl.startsWith('http')) {
          // 如果是相对路径，转换为完整URL
          if (authorUrl.startsWith('/')) {
            authorUrl = 'https://www.xiaohongshu.com' + authorUrl;
          } else {
            authorUrl = 'https://www.xiaohongshu.com/' + authorUrl;
          }
        }
      }



      // 获取博主简介 - 优先从JavaScript数据获取
      let authorBio = '';
      console.log('🔍 开始提取博主简介数据...');
      
      // 尝试从多个可能的JavaScript数据源获取
      const bioSources = [
        () => jsData?.authorBio,
        () => jsData?.bio,
        () => jsData?.description,
        () => jsData?.user?.bio,
        () => jsData?.user?.description,
        () => jsData?.user?.intro,
        () => jsData?.user?.signature,
        () => jsData?.userInfo?.bio,
        () => jsData?.userInfo?.description,
        () => jsData?.userInfo?.intro,
        () => jsData?.userInfo?.signature,
        () => jsData?.author?.bio,
        () => jsData?.author?.description,
        () => jsData?.author?.intro,
        () => jsData?.author?.signature,
        () => jsData?.noteInfo?.authorBio,
        () => jsData?.noteDetail?.authorBio,
        () => jsData?.profile?.bio,
        () => jsData?.profile?.description,
        () => jsData?.profile?.intro,
        () => jsData?.profile?.signature,
        () => jsData?.data?.user?.bio,
        () => jsData?.data?.user?.description,
        () => jsData?.data?.author?.bio,
        () => jsData?.data?.author?.description,
        () => jsData?.meta?.author?.bio,
        () => jsData?.meta?.author?.description,
        // 尝试从window对象的其他可能位置获取
        () => window.__INITIAL_STATE__?.user?.bio,
        () => window.__INITIAL_STATE__?.user?.description,
        () => window.__INITIAL_STATE__?.author?.bio,
        () => window.__INITIAL_STATE__?.author?.description,
        () => window.__NUXT__?.data?.[0]?.user?.bio,
        () => window.__NUXT__?.data?.[0]?.user?.description,
        () => window.initialData?.user?.bio,
        () => window.initialData?.user?.description,
        () => window.pageData?.user?.bio,
        () => window.pageData?.user?.description,
        () => window.userData?.bio,
        () => window.userData?.description,
        () => window.appData?.user?.bio,
        () => window.appData?.user?.description
      ];
      
      for (const getSource of bioSources) {
        try {
          const value = getSource();
          if (value !== undefined && value !== null && value !== '') {
            authorBio = String(value).trim();
            if (authorBio) {
              console.log(`✅ 从JS数据获取博主简介: ${authorBio.substring(0, 50)}...`);
              break;
            }
          }
        } catch (error) {
          // 忽略错误，继续尝试下一个数据源
        }
      }
      
      if (!authorBio) {
        const bioSelectors = [
          '.author-container .desc',
          '.user-info .desc',
          '.note-detail-author .desc',
          '.author-wrapper .desc',
          '.user-desc',
          '.author-bio',
          '[data-testid="author-bio"]',
          '.bio',
          '.description',
          '.user-description',
          '.author-description',
          '.profile-desc',
          '.profile-description',
          '.user-intro',
          '.author-intro',
          '.intro',
          '[data-bio]',
          '[data-description]',
          '.author-container .description',
          '.user-info .description',
          '.note-detail-author .description'
        ];
        
        let bioElement = null;
        for (const selector of bioSelectors) {
          bioElement = document.querySelector(selector);
          if (bioElement) {
            console.log(`✅ 使用选择器 ${selector} 找到博主简介元素`);
            break;
          }
        }
        
        if (bioElement) {
          authorBio = bioElement.textContent?.trim() ||
                     bioElement.getAttribute('data-bio') ||
                     bioElement.getAttribute('data-description') ||
                     bioElement.getAttribute('title') || '';
          if (authorBio) {
            console.log(`✅ 从DOM获取博主简介: ${authorBio.substring(0, 50)}...`);
          }
        }
      }
    
      // 获取互动数据 - 使用更准确的选择器
      // 点赞数 - 优先从JavaScript数据获取
      let likes = 0;
      console.log('🔍 开始提取点赞数据...');
      
      // 尝试从多个可能的JavaScript数据源获取
      const likeSources = [
        () => jsData?.likeCount,
        () => jsData?.interactInfo?.likeCount,
        () => jsData?.stats?.likeCount,
        () => jsData?.engagement?.likes,
        () => jsData?.metrics?.like,
        () => jsData?.noteInfo?.likeCount,
        () => jsData?.noteDetail?.likeCount,
        () => jsData?.note?.likeCount,
        () => jsData?.data?.likeCount,
        () => jsData?.interact?.likeCount,
        () => jsData?.socialData?.likes,
        () => jsData?.reactions?.like,
        () => jsData?.counts?.like,
        () => jsData?.activity?.likes,
        () => jsData?.meta?.likes,
        // 尝试从window对象的其他可能位置获取
        () => window.__INITIAL_STATE__?.note?.likeCount,
        () => window.__NUXT__?.data?.[0]?.likeCount,
        () => window.initialData?.note?.likeCount,
        () => window.pageData?.note?.likeCount,
        () => window.noteData?.likeCount,
        () => window.appData?.note?.likeCount
      ];
      
      for (const getSource of likeSources) {
        try {
          const value = getSource();
          if (value !== undefined && value !== null) {
            likes = parseInt(value) || 0;
            console.log(`✅ 从JS数据获取点赞数: ${value} -> ${likes}`);
            break;
          }
        } catch (error) {
          // 忽略获取错误，继续尝试下一个源
        }
      }
      
      if (likes === 0) {
        // 扩展DOM选择器
        const likeSelectors = [
          '.like-wrapper .count',
          '.like-btn .count',
          '[class*="like"] .count',
          '.engagement-bar .like .count',
          '.interact-bar .like .count',
          '.note-detail-interaction .like .count',
          '.like-count',
          '[data-testid="like-count"]',
          '.interaction-item[data-type="like"] .count',
          '.interaction-like .count',
          '.like-button .count',
          '.like-num',
          '.like-number',
          '[data-like-count]',
          '.social-actions .like .count',
          '.action-like .count',
          '.btn-like .count',
          '.icon-like + .count',
          '.thumbs-up .count',
          '.heart-count',
          '.praise-count'
        ];
        
        let likeElement = null;
        for (const selector of likeSelectors) {
          likeElement = document.querySelector(selector);
          if (likeElement && likeElement.textContent?.trim()) {
            console.log(`✅ 使用选择器 ${selector} 找到点赞元素`);
            break;
          }
        }
        
        if (!likeElement) {
          // 尝试通过文本内容查找
          const allElements = document.querySelectorAll('*');
          for (const element of allElements) {
            const text = element.textContent?.trim() || '';
            if (text.match(/^\d+(\.\d+)?[万千kKwW]?$/) && 
                element.className.toLowerCase().includes('like')) {
              likeElement = element;
              console.log('✅ 通过文本内容找到点赞元素');
              break;
            }
          }
        }
        
        likes = parseNumber(likeElement?.textContent || '0');
        console.log(`📊 DOM提取点赞数: ${likes}`);
      }
    
      // 评论数 - 优先从JavaScript数据获取
      let comments = 0;
      console.log('🔍 开始提取评论数据...');
      
      // 尝试从多个可能的JavaScript数据源获取
      const commentSources = [
        () => jsData?.commentCount,
        () => jsData?.interactInfo?.commentCount,
        () => jsData?.stats?.commentCount,
        () => jsData?.engagement?.comments,
        () => jsData?.metrics?.comment,
        () => jsData?.noteInfo?.commentCount,
        () => jsData?.noteDetail?.commentCount,
        () => jsData?.note?.commentCount,
        () => jsData?.data?.commentCount,
        () => jsData?.interact?.commentCount,
        () => jsData?.socialData?.comments,
        () => jsData?.reactions?.comment,
        () => jsData?.counts?.comment,
        () => jsData?.activity?.comments,
        () => jsData?.meta?.comments,
        // 尝试从window对象的其他可能位置获取
        () => window.__INITIAL_STATE__?.note?.commentCount,
        () => window.__NUXT__?.data?.[0]?.commentCount,
        () => window.initialData?.note?.commentCount,
        () => window.pageData?.note?.commentCount,
        () => window.noteData?.commentCount,
        () => window.appData?.note?.commentCount
      ];
      
      for (const getSource of commentSources) {
        try {
          const value = getSource();
          if (value !== undefined && value !== null) {
            comments = parseInt(value) || 0;
            console.log(`✅ 从JS数据获取评论数: ${value} -> ${comments}`);
            break;
          }
        } catch (error) {
          // 忽略获取错误，继续尝试下一个源
        }
      }
      
      if (comments === 0) {
        // 扩展DOM选择器
        const commentSelectors = [
          '.comment-wrapper .count',
          '.comment-btn .count',
          '[class*="comment"] .count',
          '.engagement-bar .comment .count',
          '.interact-bar .comment .count',
          '.note-detail-interaction .comment .count',
          '.comment-count',
          '[data-testid="comment-count"]',
          '.interaction-item[data-type="comment"] .count',
          '.interaction-comment .count',
          '.comment-button .count',
          '.comment-num',
          '.comment-number',
          '[data-comment-count]',
          '.social-actions .comment .count',
          '.action-comment .count',
          '.btn-comment .count',
          '.icon-comment + .count',
          '.message-count',
          '.reply-count',
          '.discuss-count'
        ];
        
        let commentElement = null;
        for (const selector of commentSelectors) {
          commentElement = document.querySelector(selector);
          if (commentElement && commentElement.textContent?.trim()) {
            console.log(`✅ 使用选择器 ${selector} 找到评论元素`);
            break;
          }
        }
        
        if (!commentElement) {
          // 尝试通过文本内容查找
          const allElements = document.querySelectorAll('*');
          for (const element of allElements) {
            const text = element.textContent?.trim() || '';
            if (text.match(/^\d+(\.\d+)?[万千kKwW]?$/) && 
                element.className.toLowerCase().includes('comment')) {
              commentElement = element;
              console.log('✅ 通过文本内容找到评论元素');
              break;
            }
          }
        }
        
        comments = parseNumber(commentElement?.textContent || '0');
        console.log(`📊 DOM提取评论数: ${comments}`);
      }
    
      // 分享数 - 优先从JavaScript数据获取
      let shares = 0;
      console.log('🔍 开始提取分享数据...');
      
      // 尝试从多个可能的JavaScript数据源获取
      const shareSources = [
        () => jsData?.shareCount,
        () => jsData?.interactInfo?.shareCount,
        () => jsData?.stats?.shareCount,
        () => jsData?.engagement?.shares,
        () => jsData?.metrics?.share,
        () => jsData?.noteInfo?.shareCount,
        () => jsData?.noteDetail?.shareCount,
        () => jsData?.note?.shareCount,
        () => jsData?.data?.shareCount,
        () => jsData?.interact?.shareCount,
        () => jsData?.socialData?.shares,
        () => jsData?.reactions?.share,
        () => jsData?.counts?.share,
        () => jsData?.activity?.shares,
        () => jsData?.meta?.shares,
        // 尝试从window对象的其他可能位置获取
        () => window.__INITIAL_STATE__?.note?.shareCount,
        () => window.__NUXT__?.data?.[0]?.shareCount,
        () => window.initialData?.note?.shareCount,
        () => window.pageData?.note?.shareCount,
        () => window.noteData?.shareCount,
        () => window.appData?.note?.shareCount
      ];
      
      for (const getSource of shareSources) {
        try {
          const value = getSource();
          if (value !== undefined && value !== null) {
            shares = parseInt(value) || 0;
            console.log(`✅ 从JS数据获取分享数: ${value} -> ${shares}`);
            break;
          }
        } catch (error) {
          // 忽略获取错误，继续尝试下一个源
        }
      }
      
      if (shares === 0) {
        // 扩展DOM选择器
        const shareSelectors = [
          '.share-wrapper .count',
          '.share-btn .count',
          '[class*="share"] .count',
          '.engagement-bar .share .count',
          '.interact-bar .share .count',
          '.note-detail-interaction .share .count',
          '.share-count',
          '[data-testid="share-count"]',
          '.interaction-item[data-type="share"] .count',
          '.interaction-share .count',
          '.share-button .count',
          '.share-num',
          '.share-number',
          '[data-share-count]',
          '.social-actions .share .count',
          '.action-share .count',
          '.btn-share .count',
          '.icon-share + .count',
          '.forward-count',
          '.repost-count',
          '.spread-count'
        ];
        
        let shareElement = null;
        for (const selector of shareSelectors) {
          shareElement = document.querySelector(selector);
          if (shareElement && shareElement.textContent?.trim()) {
            console.log(`✅ 使用选择器 ${selector} 找到分享元素`);
            break;
          }
        }
        
        if (!shareElement) {
          // 尝试通过文本内容查找
          const allElements = document.querySelectorAll('*');
          for (const element of allElements) {
            const text = element.textContent?.trim() || '';
            if (text.match(/^\d+(\.\d+)?[万千kKwW]?$/) && 
                element.className.toLowerCase().includes('share')) {
              shareElement = element;
              console.log('✅ 通过文本内容找到分享元素');
              break;
            }
          }
        }
        
        shares = parseNumber(shareElement?.textContent || '0');
        console.log(`📊 DOM提取分享数: ${shares}`);
      }

      // 收藏数 - 优先从JavaScript数据获取
      let collections = 0;
      console.log('🔍 开始提取收藏数据...');
      
      if (jsData?.collectCount !== undefined) {
        collections = parseInt(jsData.collectCount) || 0;
        console.log(`✅ 从JS数据获取收藏数: ${collections}`);
      } else if (jsData?.interactInfo?.collectCount !== undefined) {
        collections = parseInt(jsData.interactInfo.collectCount) || 0;
        console.log(`✅ 从JS interactInfo获取收藏数: ${collections}`);
      } else if (jsData?.stats?.collectCount !== undefined) {
        collections = parseInt(jsData.stats.collectCount) || 0;
        console.log(`✅ 从JS stats获取收藏数: ${collections}`);
      } else if (jsData?.engagement?.collects !== undefined) {
        collections = parseInt(jsData.engagement.collects) || 0;
        console.log(`✅ 从JS engagement获取收藏数: ${collections}`);
      } else if (jsData?.metrics?.collect !== undefined) {
        collections = parseInt(jsData.metrics.collect) || 0;
        console.log(`✅ 从JS metrics获取收藏数: ${collections}`);
      } else {
        // 扩展DOM选择器
        const collectSelectors = [
          '.collect-wrapper .count',
          '.collect-btn .count',
          '[class*="collect"] .count',
          '.engagement-bar .collect .count',
          '.interact-bar .collect .count',
          '.note-detail-interaction .collect .count',
          '.collect-count',
          '[data-testid="collect-count"]',
          '.bookmark-count',
          '.interaction-item[data-type="collect"] .count',
          '.interaction-collect .count',
          '.collect-button .count',
          '.collect-num',
          '.collect-number',
          '[data-collect-count]',
          '.social-actions .collect .count',
          '.action-collect .count',
          '.btn-collect .count',
          '.icon-collect + .count',
          '.save-count',
          '.favorite-count'
        ];
        
        let collectElement = null;
        for (const selector of collectSelectors) {
          collectElement = document.querySelector(selector);
          if (collectElement && collectElement.textContent?.trim()) {
            console.log(`✅ 使用选择器 ${selector} 找到收藏元素`);
            break;
          }
        }
        
        if (!collectElement) {
          // 尝试通过文本内容查找
          const allElements = document.querySelectorAll('*');
          for (const element of allElements) {
            const text = element.textContent?.trim() || '';
            if (text.match(/^\d+(\.\d+)?[万千kKwW]?$/) && 
                (element.className.toLowerCase().includes('collect') ||
                 element.className.toLowerCase().includes('bookmark') ||
                 element.className.toLowerCase().includes('save'))) {
              collectElement = element;
              console.log('✅ 通过文本内容找到收藏元素');
              break;
            }
          }
        }
        
        collections = parseNumber(collectElement?.textContent || '0');
        console.log(`📊 DOM提取收藏数: ${collections}`);
      }
    
      // 获取发布时间 - 优先从JavaScript数据获取
      let publishTime = '';
      console.log('🔍 开始提取发布时间数据...');
      
      if (jsData?.publishTime) {
        publishTime = new Date(jsData.publishTime).getTime().toString();
        console.log(`✅ 从JS publishTime获取时间: ${publishTime}`);
      } else if (jsData?.createTime) {
        publishTime = new Date(jsData.createTime).getTime().toString();
        console.log(`✅ 从JS createTime获取时间: ${publishTime}`);
      } else if (jsData?.time) {
        publishTime = new Date(jsData.time).getTime().toString();
        console.log(`✅ 从JS time获取时间: ${publishTime}`);
      } else if (jsData?.timestamp) {
        publishTime = jsData.timestamp.toString();
        console.log(`✅ 从JS timestamp获取时间: ${publishTime}`);
      } else if (jsData?.createdAt) {
        publishTime = new Date(jsData.createdAt).getTime().toString();
        console.log(`✅ 从JS createdAt获取时间: ${publishTime}`);
      } else if (jsData?.publishedAt) {
        publishTime = new Date(jsData.publishedAt).getTime().toString();
        console.log(`✅ 从JS publishedAt获取时间: ${publishTime}`);
      } else if (jsData?.noteInfo?.publishTime) {
        publishTime = new Date(jsData.noteInfo.publishTime).getTime().toString();
        console.log(`✅ 从JS noteInfo.publishTime获取时间: ${publishTime}`);
      } else if (jsData?.noteDetail?.publishTime) {
        publishTime = new Date(jsData.noteDetail.publishTime).getTime().toString();
        console.log(`✅ 从JS noteDetail.publishTime获取时间: ${publishTime}`);
      } else {
        // 从DOM获取 - 扩展选择器
        const timeSelectors = [
          '.note-detail-time',
          '.publish-time',
          '.note-time',
          '.time-info',
          '[data-testid="publish-time"]',
          '.time',
          '.date',
          '.note-detail-desc .time',
          '.note-scroller .time',
          '.author-info .time',
          '.note-header .time',
          '.note-meta .time',
          '.post-time',
          '.creation-time',
          '.upload-time',
          '[data-time]',
          '[data-publish-time]',
          '[data-created-at]',
          '.timestamp',
          '.datetime',
          '.note-info .time',
          '.content-time',
          '.publish-date',
          '.create-date'
        ];

        for (const selector of timeSelectors) {
          const timeElement = document.querySelector(selector);
          if (timeElement) {
            // 优先检查data属性
            const dataTime = timeElement.getAttribute('data-time') ||
                           timeElement.getAttribute('data-publish-time') ||
                           timeElement.getAttribute('data-created-at') ||
                           timeElement.getAttribute('datetime') ||
                           timeElement.getAttribute('title');
            
            if (dataTime) {
              publishTime = new Date(dataTime).getTime().toString();
              console.log(`✅ 从${selector}的属性获取时间: ${dataTime} -> ${publishTime}`);
              break;
            }
            
            const timeText = timeElement.textContent?.trim();
            if (timeText) {
              // 将相对时间转换为Unix时间戳，然后转换为字符串
              publishTime = parseRelativeTime(timeText).toString();
              console.log(`✅ 从${selector}的文本获取时间: ${timeText} -> ${publishTime}`);
              break;
            }
          }
        }

        // 如果没有找到时间，尝试从页面元数据中获取
        if (!publishTime) {
          const metaSelectors = [
            'meta[property="article:published_time"]',
            'meta[name="publish-time"]',
            'meta[property="article:created_time"]',
            'meta[name="created-time"]',
            'meta[property="og:published_time"]',
            'meta[name="date"]',
            'meta[property="article:modified_time"]',
            'meta[name="last-modified"]'
          ];
          
          for (const metaSelector of metaSelectors) {
            const metaElement = document.querySelector(metaSelector);
            const metaTime = metaElement?.getAttribute('content');
            if (metaTime) {
              publishTime = new Date(metaTime).getTime().toString();
              console.log(`✅ 从${metaSelector}获取时间: ${metaTime} -> ${publishTime}`);
              break;
            }
          }
        }
        
        // 如果仍然没有找到，尝试从JSON-LD结构化数据中获取
        if (!publishTime) {
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of jsonLdScripts) {
            try {
              const data = JSON.parse(script.textContent || '');
              const datePublished = data.datePublished || data.dateCreated || data.uploadDate;
              if (datePublished) {
                publishTime = new Date(datePublished).getTime().toString();
                console.log(`✅ 从JSON-LD获取时间: ${datePublished} -> ${publishTime}`);
                break;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    
      // 获取作者粉丝数 - 优先从悬浮窗数据获取
      let followerCount = 0;
      console.log('🔍 开始提取粉丝数数据...');
      
      // 优先使用悬浮窗数据
      if (hoverCardData.followerCount) {
        followerCount = hoverCardData.followerCount;
        console.log(`✅ 从悬浮窗获取粉丝数: ${followerCount}`);
      }
      
      // 如果悬浮窗没有数据，尝试从JavaScript数据获取
      if (!followerCount) {
        const followerSources = [
          () => jsData?.followerCount,
          () => jsData?.fansCount,
          () => jsData?.fans,
          () => jsData?.followers,
          () => jsData?.user?.followerCount,
          () => jsData?.user?.fansCount,
          () => jsData?.user?.fans,
          () => jsData?.user?.followers,
          () => jsData?.userInfo?.followerCount,
          () => jsData?.userInfo?.fansCount,
          () => jsData?.userInfo?.fans,
          () => jsData?.userInfo?.followers,
          () => jsData?.author?.followerCount,
          () => jsData?.author?.fansCount,
          () => jsData?.author?.fans,
          () => jsData?.author?.followers,
          () => jsData?.stats?.followerCount,
          () => jsData?.stats?.fansCount,
          () => jsData?.profile?.followerCount,
          () => jsData?.profile?.fansCount,
          () => jsData?.profile?.fans,
          () => jsData?.profile?.followers,
          () => jsData?.data?.followerCount,
          () => jsData?.data?.fansCount,
          () => jsData?.noteInfo?.author?.followerCount,
          () => jsData?.noteDetail?.author?.followerCount,
          () => jsData?.note?.author?.followerCount,
          // 尝试从window对象的其他可能位置获取
          () => window.__INITIAL_STATE__?.user?.followerCount,
          () => window.__NUXT__?.data?.[0]?.author?.followerCount,
          () => window.initialData?.user?.followerCount,
          () => window.pageData?.user?.followerCount,
          () => window.userData?.followerCount,
          () => window.appData?.user?.followerCount
        ];
        
        for (const getSource of followerSources) {
          try {
            const value = getSource();
            if (value !== undefined && value !== null && value !== '') {
              followerCount = parseNumber(value.toString());
              if (followerCount > 0) {
                console.log(`✅ 从JS数据获取粉丝数: ${value} -> ${followerCount}`);
                break;
              }
            }
          } catch (error) {
            // 忽略获取错误，继续尝试下一个源
          }
        }
      }
      
      if (!followerCount) {
        // 悬浮窗选择器 - 优先检查
        const hoverCardFollowerSelectors = [
          '.hover-card .follower-count',
          '.user-hover-card .follower-count',
          '.author-hover .follower-count',
          '.popup-card .follower-count',
          '.tooltip .follower-count',
          '.user-card .follower-count',
          '.author-card .follower-count',
          '.hover-card .fans-count',
          '.user-hover-card .fans-count',
          '.author-hover .fans-count',
          '.popup-card .fans-count',
          '.tooltip .fans-count',
          '.user-card .fans-count',
          '.author-card .fans-count',
          '.hover-card .fans',
          '.user-hover-card .fans',
          '.author-hover .fans',
          '.popup-card .fans',
          '.tooltip .fans',
          '.user-card .fans',
          '.author-card .fans'
        ];
        
        // 常规选择器
        const followerSelectors = [
          '.author-container .follower-count',
          '.user-info .follower-count',
          '.note-detail-author .follower-count',
          '.author-wrapper .follower-count',
          '.author-stats .follower',
          '.user-stats .follower',
          '.follower-count',
          '[data-testid="follower-count"]',
          '.fans-count',
          '.fans',
          '.followers',
          '.author-followers',
          '.user-followers',
          '.profile-followers',
          '[data-followers]',
          '[data-fans]',
          '[data-follower-count]',
          '.author-container .fans',
          '.user-info .fans',
          '.note-detail-author .fans',
          '.author-wrapper .fans'
        ];
        
        // 合并所有选择器，优先检查悬浮窗
        const allFollowerSelectors = [...hoverCardFollowerSelectors, ...followerSelectors];
        
        let followerElement = null;
        for (const selector of allFollowerSelectors) {
          followerElement = document.querySelector(selector);
          if (followerElement) {
            console.log(`✅ 使用选择器 ${selector} 找到粉丝数元素`);
            break;
          }
        }
        
        if (followerElement) {
          const followerText = followerElement.textContent?.trim() ||
                              followerElement.getAttribute('data-followers') ||
                              followerElement.getAttribute('data-fans') ||
                              followerElement.getAttribute('data-follower-count') ||
                              followerElement.getAttribute('title') || '0';
          followerCount = parseNumber(followerText);
          console.log(`✅ 从DOM获取粉丝数: ${followerText} -> ${followerCount}`);
        }
      }

      // 获取获赞与收藏数 - 优先从悬浮窗数据获取
      let likesAndCollections = '';
      console.log('🔍 开始提取获赞与收藏数据...');
      
      // 优先从悬浮窗数据获取
      if (hoverCardData.likesAndCollections) {
        likesAndCollections = hoverCardData.likesAndCollections;
        console.log(`✅ 从悬浮窗数据获取获赞与收藏: ${likesAndCollections}`);
      } else {
        // 尝试从多个可能的JavaScript数据源获取
        const likesAndCollectionsSources = [
          () => jsData?.likesAndCollections,
          () => jsData?.totalLikes,
          () => jsData?.totalEngagement,
          () => jsData?.user?.likesAndCollections,
          () => jsData?.user?.totalLikes,
          () => jsData?.user?.totalEngagement,
          () => jsData?.userInfo?.likesAndCollections,
          () => jsData?.userInfo?.totalLikes,
          () => jsData?.userInfo?.totalEngagement,
          () => jsData?.author?.likesAndCollections,
          () => jsData?.author?.totalLikes,
          () => jsData?.author?.totalEngagement,
          () => jsData?.stats?.totalLikes,
          () => jsData?.stats?.totalEngagement,
          () => jsData?.profile?.likesAndCollections,
          () => jsData?.profile?.totalLikes,
          () => jsData?.profile?.totalEngagement,
          () => jsData?.data?.likesAndCollections,
          () => jsData?.data?.totalLikes,
          () => jsData?.noteInfo?.author?.likesAndCollections,
          () => jsData?.noteDetail?.author?.likesAndCollections,
          () => jsData?.note?.author?.likesAndCollections,
          () => jsData?.engagement?.total,
          () => jsData?.metrics?.totalLikes,
          () => jsData?.activity?.totalLikes,
          // 尝试从window对象的其他可能位置获取
          () => window.__INITIAL_STATE__?.user?.likesAndCollections,
          () => window.__NUXT__?.data?.[0]?.author?.likesAndCollections,
          () => window.initialData?.user?.likesAndCollections,
          () => window.pageData?.user?.likesAndCollections,
          () => window.userData?.likesAndCollections,
          () => window.appData?.user?.likesAndCollections
        ];
        
        for (const getSource of likesAndCollectionsSources) {
          try {
            const value = getSource();
            if (value !== undefined && value !== null && value !== '') {
              likesAndCollections = value.toString();
              console.log(`✅ 从JS数据获取获赞与收藏: ${value} -> ${likesAndCollections}`);
              break;
            }
          } catch (error) {
            // 忽略获取错误，继续尝试下一个源
          }
        }
      }
      
      if (!likesAndCollections) {
        // 悬浮窗选择器 - 优先检查
        const hoverCardLikesSelectors = [
          '.hover-card .total-likes',
          '.user-hover-card .total-likes',
          '.author-hover .total-likes',
          '.popup-card .total-likes',
          '.tooltip .total-likes',
          '.user-card .total-likes',
          '.author-card .total-likes',
          '.hover-card .total-engagement',
          '.user-hover-card .total-engagement',
          '.author-hover .total-engagement',
          '.popup-card .total-engagement',
          '.tooltip .total-engagement',
          '.user-card .total-engagement',
          '.author-card .total-engagement',
          '.hover-card .likes-and-collections',
          '.user-hover-card .likes-and-collections',
          '.author-hover .likes-and-collections',
          '.popup-card .likes-and-collections',
          '.tooltip .likes-and-collections',
          '.user-card .likes-and-collections',
          '.author-card .likes-and-collections'
        ];
        
        // 常规选择器
        const likesAndCollectionsSelectors = [
          '.author-container .total-likes',
          '.user-info .total-likes',
          '.note-detail-author .total-likes',
          '.author-wrapper .total-likes',
          '.author-stats .total-engagement',
          '.user-stats .total-engagement',
          '.total-likes',
          '[data-testid="total-engagement"]',
          '.total-engagement',
          '.author-total-likes',
          '.user-total-likes',
          '.profile-total-likes',
          '.likes-and-collections',
          '.total-interactions',
          '[data-total-likes]',
          '[data-total-engagement]',
          '[data-likes-collections]',
          '.author-container .total-engagement',
          '.user-info .total-engagement',
          '.note-detail-author .total-engagement'
        ];
        
        // 合并所有选择器，优先检查悬浮窗
        const allLikesSelectors = [...hoverCardLikesSelectors, ...likesAndCollectionsSelectors];
        
        let likesAndCollectionsElement = null;
        for (const selector of allLikesSelectors) {
          likesAndCollectionsElement = document.querySelector(selector);
          if (likesAndCollectionsElement) {
            console.log(`✅ 使用选择器 ${selector} 找到获赞与收藏元素`);
            break;
          }
        }
        
        if (likesAndCollectionsElement) {
          likesAndCollections = likesAndCollectionsElement.textContent?.trim() ||
                               likesAndCollectionsElement.getAttribute('data-total-likes') ||
                               likesAndCollectionsElement.getAttribute('data-total-engagement') ||
                               likesAndCollectionsElement.getAttribute('data-likes-collections') ||
                               likesAndCollectionsElement.getAttribute('title') || '';
          if (likesAndCollections) {
            console.log(`✅ 从DOM获取获赞与收藏: ${likesAndCollections}`);
          }
        }
      }

      // 获取笔记话题 - 使用更准确的选择器
      const topics: string[] = [];
      
      // 尝试多种选择器来获取话题
      const topicSelectors = [
        '.note-detail-topic .topic-item',
        '.topic-list .topic',
        '.hashtag-list .hashtag',
        '.note-topic .topic',
        '.topic-container .topic',
        '[data-testid="topic"]',
        '.topic',
        '.hashtag',
        'a[href*="/search_result?keyword="]',
        'a[href*="/topic/"]',
        '.tag-item[href*="/search_result"]'
      ];

      for (const selector of topicSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const topicText = el.textContent?.trim();
            if (topicText && !topics.includes(topicText)) {
              // 清理话题文本，移除#符号
              const cleanTopic = topicText.replace(/^#/, '').trim();
              if (cleanTopic) {
                topics.push(cleanTopic);
              }
            }
          });
          break; // 找到话题后就停止搜索
        }
      }

      console.log('提取到的话题:', topics);

      // 判断笔记类型
      const hasVideo = document.querySelector('video') || document.querySelector('.video-container');
      const noteType = hasVideo ? '视频' : '图文';

      // 获取视频封面
      const videoCoverElement = document.querySelector('video') as HTMLVideoElement;
      const videoCover = videoCoverElement?.poster || '';
    
      // 计算赞粉比（点赞数/粉丝数）
      const likeFollowRatio = followerCount > 0 ? Number((likes / followerCount).toFixed(4)) : 0;
    
      // 计算笔记评分（基于互动数据的综合评分）
      const noteScore = calculateNoteScore(likes, comments, shares, followerCount);



      // 提取笔记内容
      const rawContent = extractNoteContent();

      // 提取笔记标签
      const tags = extractNoteTags();

      // 保留原始内容格式，并在最后附加标签
      let content = rawContent;
      if (tags && tags.length > 0) {
        // 在内容末尾添加标签
        const tagString = tags.map(tag => `#${tag}`).join(' ');
        content = content ? `${content}\n\n${tagString}` : tagString;
      }
    
      // 获取更新时间 - 优先从JavaScript数据获取
      let updateTime = '';
      console.log('🔍 开始提取更新时间数据...');
      
      // 尝试从多个可能的JavaScript数据源获取
      const updateTimeSources = [
        () => jsData?.updateTime,
        () => jsData?.lastModified,
        () => jsData?.modifiedTime,
        () => jsData?.lastUpdateTime,
        () => jsData?.updatedAt,
        () => jsData?.editTime,
        () => jsData?.lastEditTime,
        () => jsData?.noteInfo?.updateTime,
        () => jsData?.noteDetail?.updateTime,
        () => jsData?.noteInfo?.lastModified,
        () => jsData?.noteDetail?.lastModified,
        () => jsData?.note?.updateTime,
        () => jsData?.note?.lastModified,
        () => jsData?.data?.updateTime,
        () => jsData?.data?.lastModified,
        () => jsData?.meta?.updateTime,
        () => jsData?.meta?.lastModified,
        () => jsData?.timestamps?.updated,
        () => jsData?.timestamps?.modified,
        () => jsData?.time?.updated,
        () => jsData?.time?.modified,
        // 尝试从window对象的其他可能位置获取
        () => window.__INITIAL_STATE__?.note?.updateTime,
        () => window.__NUXT__?.data?.[0]?.updateTime,
        () => window.initialData?.note?.updateTime,
        () => window.pageData?.note?.updateTime,
        () => window.noteData?.updateTime,
        () => window.appData?.note?.updateTime
      ];
      
      for (const getSource of updateTimeSources) {
        try {
          const value = getSource();
          if (value !== undefined && value !== null && value !== '') {
            updateTime = convertToTimestamp(value);
            if (updateTime) {
              console.log(`✅ 从JS数据获取更新时间: ${value} -> ${updateTime}`);
              break;
            }
          }
        } catch (error) {
          // 忽略获取错误，继续尝试下一个源
        }
      }
      
      // 如果JavaScript数据中没有更新时间，尝试从DOM获取
      if (!updateTime) {
        const updateTimeSelectors = [
          '[data-update-time]',
          '.update-time',
          '.last-modified',
          '.modified-time',
          '.edit-time',
          '.last-edit-time',
          '[data-last-modified]',
          '[data-modified-time]',
          '[data-updated-at]',
          '.note-update-time',
          '.content-update-time',
          '.post-update-time',
          '.modification-time',
          '.last-update'
        ];
        
        let updateTimeElement = null;
        for (const selector of updateTimeSelectors) {
          updateTimeElement = document.querySelector(selector);
          if (updateTimeElement) {
            console.log(`✅ 使用选择器 ${selector} 找到更新时间元素`);
            break;
          }
        }
        
        if (updateTimeElement) {
          const timeText = updateTimeElement.textContent?.trim() || 
                          updateTimeElement.getAttribute('data-update-time') ||
                          updateTimeElement.getAttribute('data-last-modified') ||
                          updateTimeElement.getAttribute('data-modified-time') ||
                          updateTimeElement.getAttribute('data-updated-at') ||
                          updateTimeElement.getAttribute('datetime') ||
                          updateTimeElement.getAttribute('title') || '';
          if (timeText) {
            updateTime = convertToTimestamp(timeText);
            console.log(`✅ 从DOM获取更新时间: ${timeText} -> ${updateTime}`);
          }
        }
        
        // 如果仍然没有找到，尝试从meta标签获取
        if (!updateTime) {
          const metaSelectors = [
            'meta[property="article:modified_time"]',
            'meta[name="last-modified"]',
            'meta[property="og:updated_time"]',
            'meta[name="updated-time"]',
            'meta[name="edit-time"]'
          ];
          
          for (const metaSelector of metaSelectors) {
            const metaElement = document.querySelector(metaSelector);
            const metaTime = metaElement?.getAttribute('content');
            if (metaTime) {
              updateTime = convertToTimestamp(metaTime);
              console.log(`✅ 从${metaSelector}获取更新时间: ${metaTime} -> ${updateTime}`);
              break;
            }
          }
        }
        
        // 如果仍然没有找到，尝试从JSON-LD结构化数据中获取
        if (!updateTime) {
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of jsonLdScripts) {
            try {
              const data = JSON.parse(script.textContent || '');
              const dateModified = data.dateModified || data.dateUpdated || data.lastModified;
              if (dateModified) {
                updateTime = convertToTimestamp(dateModified);
                console.log(`✅ 从JSON-LD获取更新时间: ${dateModified} -> ${updateTime}`);
                break;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 获取笔记链接
      const noteUrl = window.location.href;

      return {
        title,
        author,
        authorUrl,
        authorBio,
        likes,
        comments,
        shares,
        collections,
        publishTime,
        updateTime,
        recommendLevel: 'medium', // 默认值，用户可以修改
        likeFollowRatio,
        followerCount,
        likesAndCollections,
        noteScore,
        content,
        tags,
        topics,
        noteType,
        videoCover,
        noteUrl
      };
    }



    // 提取笔记内容
    function extractNoteContent(): string {
      // 尝试多种选择器来获取笔记文本内容
      const contentSelectors = [
        '.note-detail-desc',
        '.note-content-text',
        '.note-text',
        '[data-testid="note-content"]',
        '.content-text',
        '.note-scroller .content'
      ];

      for (const selector of contentSelectors) {
        const contentElement = document.querySelector(selector);
        if (contentElement) {
          // 使用innerHTML获取内容，然后转换为保留格式的文本
          let content = contentElement.innerHTML;
          if (content) {
            // 将HTML标签转换为换行符，保留原有格式
            content = content
              .replace(/<br\s*\/?>/gi, '\n')  // 将<br>标签转换为换行符
              .replace(/<\/p>/gi, '\n\n')     // 将</p>标签转换为双换行符
              .replace(/<p[^>]*>/gi, '')      // 移除<p>开始标签
              .replace(/<div[^>]*>/gi, '\n')  // 将<div>标签转换为换行符
              .replace(/<\/div>/gi, '')       // 移除</div>标签
              .replace(/<[^>]*>/g, '')        // 移除其他HTML标签
              .replace(/&nbsp;/g, ' ')        // 将&nbsp;转换为空格
              .replace(/&lt;/g, '<')          // 解码HTML实体
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&')
              .replace(/\n\s*\n\s*\n/g, '\n\n') // 将多个连续换行符合并为双换行符
              .trim();
            
            if (content) {
              console.log('提取到的内容:', content);
              return content;
            }
          }
          
          // 如果innerHTML处理失败，回退到textContent
          const textContent = contentElement.textContent?.trim();
          if (textContent) {
            console.log('提取到的内容(textContent):', textContent);
            return textContent;
          }
        }
      }

      console.log('未找到笔记内容');
      return '';
    }

    // 提取笔记标签
    function extractNoteTags(): string[] {
      const tags: string[] = [];
      
      // 尝试多种选择器来获取标签
      const tagSelectors = [
        '.tag-item',
        '.note-tag',
        '.hashtag',
        '[data-testid="tag"]',
        '.topic-tag',
        '.tag-list .tag',
        '.note-detail-tag',
        'a[href*="/search_result?keyword="]'
      ];

      for (const selector of tagSelectors) {
        const tagElements = document.querySelectorAll(selector);
        tagElements.forEach(element => {
          const tagText = element.textContent?.trim();
          if (tagText && !tags.includes(tagText)) {
            // 清理标签文本，移除#号等特殊字符
            const cleanTag = tagText.replace(/^#/, '').trim();
            if (cleanTag) {
              tags.push(cleanTag);
            }
          }
        });
      }

      // 如果没有找到标签，尝试从内容中提取话题标签
      if (tags.length === 0) {
        const content = extractNoteContent();
        const hashtagRegex = /#([^\s#]+)/g;
        let match;
        while ((match = hashtagRegex.exec(content)) !== null) {
          const tag = match[1].trim();
          if (tag && !tags.includes(tag)) {
            tags.push(tag);
          }
        }
      }

      console.log('提取到的标签:', tags);
      return tags;
    }

    // 清理正文中的标签，避免重复显示
    function cleanContentFromTags(content: string, tags: string[]): string {
      if (!content || !tags || tags.length === 0) {
        return content;
      }

      let cleanedContent = content;

      // 移除正文中的标签
      tags.forEach(tag => {
        // 移除 #标签 格式
        const hashtagPattern = new RegExp(`#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'gi');
        cleanedContent = cleanedContent.replace(hashtagPattern, '');
        
        // 移除单独的标签文本
        const tagPattern = new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s*`, 'gi');
        cleanedContent = cleanedContent.replace(tagPattern, '');
      });

      // 清理多余的空白字符
      cleanedContent = cleanedContent
        .replace(/\s+/g, ' ')  // 多个空格替换为单个空格
        .replace(/^\s+|\s+$/g, '')  // 移除首尾空格
        .replace(/\n\s*\n/g, '\n');  // 移除多余的空行

      return cleanedContent;
    }

    // 解析数字（处理k、w等单位）
    function parseNumber(text: string): number {
      if (!text) return 0;
    
      const cleanText = text.replace(/[^\d.kw万千]/gi, '');
      const num = parseFloat(cleanText);
    
      if (isNaN(num)) return 0;
    
      if (cleanText.includes('w') || cleanText.includes('万')) {
        return Math.round(num * 10000);
      } else if (cleanText.includes('k') || cleanText.includes('千')) {
        return Math.round(num * 1000);
      }
    
      return Math.round(num);
    }

    // 解析相对时间并转换为Unix时间戳
    function parseRelativeTime(timeText: string): number {
      if (!timeText) {
        return Math.floor(Date.now() / 1000); // 返回当前时间的Unix时间戳
      }

      const now = new Date();
      const currentTimestamp = Math.floor(now.getTime() / 1000);

      // 清理时间文本，移除地理位置信息
      const cleanTimeText = timeText.replace(/\s*[^\d\u4e00-\u9fa5]+$/, '').trim();
      
      // 匹配各种相对时间格式
      const patterns = [
        { regex: /(\d+)\s*秒前/, unit: 'seconds' },
        { regex: /(\d+)\s*分钟前/, unit: 'minutes' },
        { regex: /(\d+)\s*小时前/, unit: 'hours' },
        { regex: /(\d+)\s*天前/, unit: 'days' },
        { regex: /(\d+)\s*周前/, unit: 'weeks' },
        { regex: /(\d+)\s*月前/, unit: 'months' },
        { regex: /(\d+)\s*年前/, unit: 'years' },
        { regex: /刚刚/, unit: 'now' },
        { regex: /今天/, unit: 'today' },
        { regex: /昨天/, unit: 'yesterday' }
      ];

      for (const pattern of patterns) {
        const match = cleanTimeText.match(pattern.regex);
        if (match) {
          const value = match[1] ? parseInt(match[1]) : 0;
          
          switch (pattern.unit) {
            case 'now':
              return currentTimestamp;
            case 'seconds':
              return currentTimestamp - (value * 1);
            case 'minutes':
              return currentTimestamp - (value * 60);
            case 'hours':
              return currentTimestamp - (value * 3600);
            case 'days':
              return currentTimestamp - (value * 86400);
            case 'weeks':
              return currentTimestamp - (value * 604800);
            case 'months':
              return currentTimestamp - (value * 2592000); // 30天
            case 'years':
              return currentTimestamp - (value * 31536000); // 365天
            case 'today':
              // 设置为今天的开始时间
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              return Math.floor(today.getTime() / 1000);
            case 'yesterday':
              // 设置为昨天的开始时间
              const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
              return Math.floor(yesterday.getTime() / 1000);
          }
        }
      }

      // 如果无法解析，尝试解析具体日期格式
      try {
        // 尝试解析常见的日期格式
        const dateFormats = [
          /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
          /(\d{1,2})-(\d{1,2})/, // MM-DD (当年)
          /(\d{1,2})月(\d{1,2})日/ // MM月DD日
        ];

        for (const format of dateFormats) {
          const match = cleanTimeText.match(format);
          if (match) {
            let year = now.getFullYear();
            let month = 0;
            let day = 1;

            if (match.length === 4) { // YYYY-MM-DD
              year = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              day = parseInt(match[3]);
            } else if (match.length === 3) { // MM-DD 或 MM月DD日
              month = parseInt(match[1]) - 1;
              day = parseInt(match[2]);
            }

            const date = new Date(year, month, day);
            return Math.floor(date.getTime() / 1000);
          }
        }
      } catch (error) {
        console.warn('解析日期时出错:', error);
      }

      // 如果都无法解析，返回当前时间
      console.warn('无法解析时间格式:', timeText, '使用当前时间');
      return currentTimestamp;
    }

    // 计算笔记评分（0-100分）
    function calculateNoteScore(likes: number, comments: number, shares: number, followerCount: number): number {
      // 基础互动分数（40分）
      const engagementScore = Math.min(40, (likes + comments * 2 + shares * 3) / 100);
    
      // 互动率分数（30分）
      const engagementRate = followerCount > 0 ? (likes + comments + shares) / followerCount : 0;
      const engagementRateScore = Math.min(30, engagementRate * 1000);
    
      // 内容质量分数（30分）- 基于评论点赞比
      const commentLikeRatio = likes > 0 ? comments / likes : 0;
      const qualityScore = Math.min(30, commentLikeRatio * 100);
    
      const totalScore = engagementScore + engagementRateScore + qualityScore;
      return Math.round(Math.min(100, totalScore));
    }

    // 更新数据显示

    
    // 处理推荐程度变化
    function handleRecommendChange(event: Event): void {
      const target = event.target as HTMLSelectElement;
      const recommendLevel = parseInt(target.value);
      
      // 显示推荐程度变化消息
      const stars = '⭐'.repeat(recommendLevel);
      showMessage(`推荐程度已设置为: ${stars}`, 'success');
      
      // 这里可以添加保存推荐程度到本地存储的逻辑
      try {
        localStorage.setItem('xhs-current-recommend-level', recommendLevel.toString());
      } catch (error) {
        console.warn('无法保存推荐程度到本地存储:', error);
      }
    }
    
    // 处理同步笔记
    async function handleSyncNote(): Promise<void> {
      try {
        // 检查扩展上下文
        if (!isExtensionContextValid()) {
          showMessage('扩展上下文已失效，请刷新页面重试', 'error');
          return;
        }

        showMessage('正在同步笔记到飞书...', 'info');
        
        // 获取当前推荐程度
        const recommendSelect = document.getElementById('xhs-recommend-select') as HTMLSelectElement;
        const recommendLevel = recommendSelect ? parseInt(recommendSelect.value) : 3;
        
        // 提取笔记数据
        const noteData = extractNoteData();
        if (!noteData) {
          showMessage('无法提取笔记数据，请确保在笔记详情页', 'error');
          return;
        }
        
        // 添加推荐程度到数据中
        const dataWithRecommend = {
          ...noteData,
          recommendLevel
        };
        
        // 获取飞书配置
        const configResult = await chrome.storage.local.get('feishuConfig');
        const config = configResult.feishuConfig;
        
        if (!config || !config.appId || !config.appSecret) {
          showMessage('请先在侧边栏配置飞书应用信息', 'error');
          return;
        }
        
        // 使用安全的消息发送方法
        const response = await safeRuntimeSendMessage({
          action: 'syncToFeishu',
          data: dataWithRecommend,
          config: config,
          currentUrl: window.location.href
        });
        
        if (response && response.success) {
          showMessage('笔记同步成功！', 'success');
        } else {
          // 确保错误信息正确显示
          let errorMessage = '未知错误';
          if (response?.error) {
            if (typeof response.error === 'string') {
              errorMessage = response.error;
            } else if (typeof response.error === 'object') {
              errorMessage = JSON.stringify(response.error);
            } else {
              errorMessage = String(response.error);
            }
          }
          showMessage(`同步失败: ${errorMessage}`, 'error');
        }
      } catch (error) {
        console.error('同步笔记时出错:', error);
        if (error instanceof Error && error.message && error.message.includes('Extension context invalidated')) {
          showMessage('扩展上下文已失效，请刷新页面重试', 'error');
        } else {
          showMessage('同步失败，请检查网络连接', 'error');
        }
      }
    }
    
    // 处理复制笔记信息
    async function handleCopyNote(): Promise<void> {
      try {
        const noteData = extractNoteData();
        if (!noteData) {
          showMessage('无法提取笔记数据', 'error');
          return;
        }
        
        // 格式化复制文本，按照用户要求的格式
        let copyText = '';
        
        // 笔记标题
        copyText += `笔记标题：${noteData.title || '未获取到标题'}`;
        
        // 笔记正文
        copyText += `\n\n笔记正文：${noteData.content && noteData.content.trim() ? noteData.content : '未获取到正文内容'}`;
        
        // 笔记标签
        copyText += `\n\n笔记标签：`;
        if (noteData.tags && noteData.tags.length > 0) {
          copyText += noteData.tags.map(tag => `#${tag}`).join(' ');
        } else {
          copyText += '未获取到标签';
        }
        
        // 复制到剪贴板
        await navigator.clipboard.writeText(copyText);
        showMessage('笔记信息已复制到剪贴板！', 'success');
        
      } catch (error) {
        console.error('复制笔记信息时出错:', error);
        showMessage('复制失败，请手动选择文本复制', 'error');
      }
    }
    
    // 显示消息提示
    function showMessage(text: string, type: 'success' | 'error' | 'info') {
      // 移除现有消息
      const existingMessage = document.querySelector('.xhs-message');
      if (existingMessage) {
        existingMessage.remove();
      }

      const message = document.createElement('div');
      message.className = 'xhs-message';
      message.textContent = text;

      const colors = {
        success: { bg: '#f6ffed', border: '#b7eb8f', text: '#52c41a' },
        error: { bg: '#fff2f0', border: '#ffccc7', text: '#ff4d4f' },
        info: { bg: '#e6f7ff', border: '#91d5ff', text: '#1890ff' }
      };

      Object.assign(message.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 16px',
        backgroundColor: colors[type].bg,
        border: `1px solid ${colors[type].border}`,
        color: colors[type].text,
        borderRadius: '6px',
        fontSize: '14px',
        zIndex: '10000',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.3s ease'
      });

      document.body.appendChild(message);

      // 3秒后自动移除
      setTimeout(() => {
        message.style.opacity = '0';
        message.style.transform = 'translateX(100%)';
        setTimeout(() => message.remove(), 300);
      }, 3000);
    }

    // 在笔记详情页添加功能按钮
    function addFunctionButtonsToNotePage() {
      console.log('🔍 [DEBUG] addFunctionButtonsToNotePage 开始执行');
      
      // 检查页面类型
      const isNotePage = antiDetection.isNoteDetailPage();
      console.log('🔍 [DEBUG] 页面检测结果 (addFunctionButtonsToNotePage):', isNotePage);
      
      if (!isNotePage) {
        console.log('非笔记页面，跳过按钮添加');
        return false;
      }

      const pathname = location.pathname;
      const isSearchPage = pathname.includes('/search');
      
      console.log('🔍 [DEBUG] 页面类型:', { pathname, isSearchPage });

      // 如果是搜索结果页面，处理多个笔记卡片
      if (isSearchPage) {
        return addButtonsToSearchResults();
      } else {
        // 处理单个笔记详情页
        return addButtonToSingleNote();
      }
    }

    // 为搜索结果页面添加按钮
    function addButtonsToSearchResults() {
      console.log('🔍 [DEBUG] 处理搜索结果页面和推荐页面');
      
      // 查找搜索结果和推荐页面中的笔记卡片
      const noteCards = document.querySelectorAll([
        '.note-item',
        '[class*="note"]',
        '.feeds-page .note',
        '.search-result .note',
        '.explore-feed .note',
        '.waterfall .note',
        'a[href*="/explore/"]',
        'a[href*="/discovery/item/"]',
        // 推荐页面的更多选择器
        '.waterfall-item',
        '.feed-item',
        '.explore-item',
        '[data-v-] a[href*="/explore/"]',
        '[data-v-] a[href*="/discovery/"]',
        // 通用的笔记链接选择器
        'a[href*="xiaohongshu.com/explore/"]',
        'a[href*="xiaohongshu.com/discovery/item/"]',
        // 基于图片的笔记卡片
        'div[class*="cover"] img[src*="sns-webpic"]',
        'div[class*="image"] img[src*="sns-webpic"]'
      ].join(', '));
      
      console.log(`🔍 [DEBUG] 找到 ${noteCards.length} 个笔记卡片`);
      
      let addedCount = 0;
      noteCards.forEach((card, index) => {
        // 检查是否已经添加过按钮
        if (card.querySelector('.xhs-helper-buttons')) {
          return;
        }
        
        // 如果是图片元素，找到其父容器
        let targetCard = card;
        if (card.tagName === 'IMG') {
          // 向上查找合适的容器
          let parent = card.parentElement;
          while (parent && !parent.querySelector('a[href*="/explore/"], a[href*="/discovery/"]')) {
            parent = parent.parentElement;
            if (!parent || parent === document.body) break;
          }
          if (parent && parent !== document.body) {
            targetCard = parent;
          }
        }
        
        // 为每个笔记卡片添加按钮
        const functionButtons = createFunctionButtons();
        const randomClass = antiDetection.generateRandomClass();
        functionButtons.className = `xhs-helper-buttons ${randomClass}`;
        functionButtons.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 1000;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 4px;
          padding: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(4px);
        `;
        
        // 确保卡片有相对定位
        if (getComputedStyle(targetCard).position === 'static') {
          (targetCard as HTMLElement).style.position = 'relative';
        }
        
        targetCard.appendChild(functionButtons);
        addedCount++;
        
        console.log(`✅ 为笔记卡片 ${index + 1} 添加了功能按钮`, targetCard);
      });
      
      console.log(`✅ 总共为 ${addedCount} 个笔记卡片添加了功能按钮`);
      return addedCount > 0;
    }

    // 为单个笔记详情页添加按钮
    function addButtonToSingleNote() {
      console.log('🔍 [DEBUG] 处理单个笔记详情页');
      
      // 检查是否已存在按钮
      const existingButtons = document.querySelector('.xhs-helper-buttons');
      console.log('🔍 [DEBUG] 检查已存在按钮:', existingButtons);
      
      if (existingButtons) {
        console.log('功能按钮已存在，跳过添加');
        return false;
      }

      console.log('🔍 [DEBUG] 开始查找标题元素...');
      
      // 查找标题元素
      const titleSelectors = [
        '#detail-title',
        '[data-testid="note-title"]',
        '.note-detail-title',
        'h1',
        'h2',
        'div[class*="title"]'
      ];

      let titleElement: Element | null = null;
      
      for (const selector of titleSelectors) {
        console.log(`🔍 [DEBUG] 尝试标题选择器: ${selector}`);
        const element = document.querySelector(selector);
        if (element && (element as HTMLElement).offsetHeight > 0 && (element as HTMLElement).offsetWidth > 0) {
          titleElement = element;
          console.log(`✅ 找到标题元素: ${selector}`, element);
          break;
        }
      }
      
      if (titleElement) {
        console.log('🔍 [DEBUG] 找到标题，在标题上方插入按钮');
        
        const functionButtons = createFunctionButtons();
        
        // 应用防检测机制
        const randomClass = antiDetection.generateRandomClass();
        functionButtons.className = `xhs-helper-buttons ${randomClass}`;
        
        // 设置按钮样式：在标题上方，水平排列，紧凑布局
        functionButtons.style.cssText = `
          position: relative;
          display: flex;
          flex-direction: row;
          gap: 6px;
          margin: 4px 0 6px 0;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-sizing: border-box;
          justify-content: flex-start;
          align-items: center;
        `;
        
        // 随机化样式（但保持基本布局）
        antiDetection.randomizeStyles(functionButtons);
        
        // 在标题前插入按钮
        titleElement.parentNode?.insertBefore(functionButtons, titleElement);
        
        // 模拟自然的加载过程
        setTimeout(() => {
          // 初始化数据显示
          const noteData = extractNoteData();
          if (noteData) {
            updateDataDisplay();
          }
          
          // 模拟鼠标移动
          antiDetection.simulateMouseMovement(functionButtons);
        }, antiDetection.randomDelay(200, 500));

        console.log('✅ 功能按钮已添加到标题上方', titleElement);
        return true;
      } else {
        console.log('⚠️ 未找到标题元素，尝试其他插入位置');
        
        // 备用方案：查找合适的内容容器
        const contentSelectors = [
          '.note-content',
          '.note-detail',
          '.note-scroller',
          '.note-item',
          '[data-v-] .note-content',
          '[data-v-] .note-detail',
          'main',
          '.container',
          '.content'
        ];
        
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element && (element as HTMLElement).offsetHeight > 0) {
            const functionButtons = createFunctionButtons();
            const randomClass = antiDetection.generateRandomClass();
            functionButtons.className = `xhs-helper-buttons ${randomClass}`;
            
            // 设置按钮样式：在容器顶部，水平排列，紧凑布局
            functionButtons.style.cssText = `
              position: relative;
              display: flex;
              flex-direction: row;
              gap: 6px;
              margin: 4px 0 6px 0;
              z-index: 1000;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              box-sizing: border-box;
              justify-content: flex-start;
              align-items: center;
            `;
            
            // 应用防检测机制
            antiDetection.randomizeStyles(functionButtons);
            
            // 插入到容器的开头
            if (element.firstChild) {
              element.insertBefore(functionButtons, element.firstChild);
            } else {
              element.appendChild(functionButtons);
            }
            
            // 延迟初始化数据
            setTimeout(() => {
              const noteData = extractNoteData();
              if (noteData) {
                updateDataDisplay();
              }
              antiDetection.simulateMouseMovement(functionButtons);
            }, antiDetection.randomDelay(300, 700));
            
            console.log(`✅ 功能按钮已添加到备用位置: ${selector}`, element);
            return true;
          }
        }
        
        console.log('❌ 所有插入位置都失败，跳过按钮添加');
        return false;
      }
    }



    // 防检测工具函数
    const antiDetection = {
      // 随机延迟
      randomDelay: (min: number = 800, max: number = 2500) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      },
      
      // 模拟人类行为的延迟
      humanLikeDelay: () => {
        const delays = [1200, 1500, 1800, 2100, 2400];
        return delays[Math.floor(Math.random() * delays.length)];
      },
      
      // 检查是否为笔记详情页（优化检测逻辑，更加宽松和准确）
      isNoteDetailPage: () => {
        const url = location.href;
        const pathname = location.pathname;
        
        console.log('🔍 [DEBUG] 页面检测开始:', { url, pathname });
        
        // 支持多种小红书笔记URL格式（更宽松的匹配）
        const notePatterns = [
          /\/explore\/[a-f0-9]{24}/,           // /explore/24位笔记ID (精确匹配24位ID)
          /\/discovery\/item\/[a-f0-9]+/,      // /discovery/item/笔记ID
          /\/user\/profile\/[a-f0-9]+\/[a-f0-9]+/, // 用户页面的笔记
          /\/note\/[a-f0-9]+/,                 // /note/笔记ID
          /\/notes\/[a-f0-9]+/,                // /notes/笔记ID
        ];
        
        // 检查URL是否匹配笔记详情页面格式
        const isNoteDetailUrl = notePatterns.some(pattern => {
          const match = pattern.test(pathname);
          console.log('🔍 [DEBUG] 模式匹配:', { pattern: pattern.toString(), match });
          return match;
        });
        
        // 明确排除的列表页面
        const excludePatterns = [
          /^\/$/, // 首页
          /^\/home/, // 主页
          /^\/explore$/, // 探索页面（不带笔记ID）
          /^\/explore\?/, // 探索页面（带查询参数但无笔记ID）
          /^\/search$/, // 搜索页面（仅排除不带参数的搜索页）
          /^\/user\/profile\/[a-f0-9]+$/, // 用户主页（不带笔记ID）
        ];
        
        const isExcludedPage = excludePatterns.some(pattern => {
          const match = pattern.test(pathname);
          console.log('🔍 [DEBUG] 排除模式匹配:', { pattern: pattern.toString(), match });
          return match;
        });
        
        // 特殊处理搜索结果页面
        const isSearchResultPage = /^\/search_result/.test(pathname);
        const hasSearchKeyword = url.includes('keyword=');
        
        // 检查页面是否包含笔记详情内容元素（扩展选择器）
        const detailSelectors = [
          '.note-detail',
          '.note-content', 
          '[data-testid="note-title"]',
          '#detail-title',
          '.note-scroller',
          // 添加更多可能的选择器
          '.note-text',
          '.note-info',
          '[class*="note-detail"]',
          '[class*="note-content"]',
          // 基于实际页面结构的选择器
          'div[class*="p-4"][class*="xl:p-6"]',
          'div[class*="flex"][class*="gap-3"]'
        ];
        
        const hasNoteDetailContent = detailSelectors.some(selector => 
          document.querySelector(selector)
        );
        
        // 检查是否存在多个笔记卡片（更准确的列表页面检测）
        const listSelectors = [
          '.note-item',
          '[class*="note-card"]', 
          '.waterfall-item',
          '.feed-item',
          '.explore-item'
        ];
        
        const noteCards = document.querySelectorAll(listSelectors.join(', '));
        const hasMultipleNotes = noteCards.length > 2; // 改为大于2，允许一些边界情况
        
        // 检查页面标题或其他特征
        const hasNoteTitle = !!(
          document.querySelector('h1') ||
          document.querySelector('[class*="title"]') ||
          document.title.includes('笔记') ||
          document.title.includes('小红书')
        );
        
        // 更宽松的判断逻辑
        let result = false;
        
        console.log('🔍 [DEBUG] 判断条件:', {
          isNoteDetailUrl,
          isExcludedPage,
          hasNoteDetailContent,
          hasNoteTitle,
          hasMultipleNotes,
          noteCardsCount: noteCards.length
        });
        
        if (isNoteDetailUrl && !isExcludedPage) {
          // URL匹配笔记格式且不在排除列表中
          console.log('🔍 [DEBUG] URL匹配笔记格式且不在排除列表中');
          result = true; // 简化逻辑：如果URL匹配且不被排除，就认为是笔记详情页
        } else if (isSearchResultPage && hasSearchKeyword) {
          // 搜索结果页面的特殊处理
          console.log('🔍 [DEBUG] 搜索结果页面特殊处理');
          if (hasNoteDetailContent || hasNoteTitle) {
            // 有详情内容或标题
            if (!hasMultipleNotes) {
              // 没有多个笔记卡片，可能是单个笔记的搜索结果
              result = true;
            }
          }
        }
        
        // 详细的DOM元素检测（用于调试）
        const debugInfo = {
          url,
          pathname,
          isNoteDetailUrl,
          isExcludedPage,
          isSearchResultPage,
          hasSearchKeyword,
          hasNoteDetailContent,
          hasMultipleNotes,
          hasNoteTitle,
          noteCardsCount: noteCards.length,
          detailElements: detailSelectors.map(sel => ({
            selector: sel,
            found: !!document.querySelector(sel)
          })).filter(item => item.found),
          result
        };
        
        console.log('🔍 [DEBUG] 页面检测详情:', debugInfo);
        
        return result;
      },
      
      // 检测悬浮笔记详情弹窗
      isNoteDetailModal: () => {
        // 更精确的小红书弹窗检测
        const specificSelectors = [
          // 小红书特有的弹窗结构
          'div[style*="position: fixed"][style*="z-index: 1000"]',
          'div[style*="position: fixed"][style*="z-index: 999"]',
          'div[style*="position: fixed"][style*="z-index: 9999"]',
          // 可能的弹窗容器类名
          'div[class*="NoteDetailModal"]',
          'div[class*="note-detail-modal"]',
          'div[class*="DetailModal"]',
          'div[class*="PopupModal"]',
          // 通用模态框
          '.modal',
          '.dialog',
          '[role="dialog"]',
          '[aria-modal="true"]'
        ];

        // 检查每个可能的弹窗容器
        for (const selector of specificSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            
            for (const element of elements) {
              // 检查元素是否可见且有合理的尺寸
              const rect = element.getBoundingClientRect();
              if (rect.width < 300 || rect.height < 200) {
                continue; // 太小的元素不太可能是笔记弹窗
              }

              // 检查是否包含笔记内容的特征
              const hasNoteFeatures = [
                // 图片内容
                element.querySelector('img'),
                // 文本内容
                element.querySelector('div[class*="content"]'),
                element.querySelector('div[class*="text"]'),
                element.querySelector('p'),
                // 标题
                element.querySelector('h1, h2, h3'),
                element.querySelector('div[class*="title"]'),
                // 用户信息
                element.querySelector('div[class*="user"]'),
                element.querySelector('div[class*="author"]'),
                // 互动按钮
                element.querySelector('div[class*="like"]'),
                element.querySelector('div[class*="collect"]'),
                element.querySelector('div[class*="share"]'),
                // 评论区域
                element.querySelector('div[class*="comment"]')
              ].filter(Boolean);

              // 如果有足够的笔记特征，认为是笔记弹窗
              if (hasNoteFeatures.length >= 2) {
                console.log('🔍 [DEBUG] 找到悬浮笔记详情弹窗:', {
                  element,
                  selector,
                  features: hasNoteFeatures.length,
                  size: { width: rect.width, height: rect.height }
                });
                return element;
              }
            }
          } catch (e) {
            console.warn('检测弹窗时出错:', selector, e);
          }
        }

        return null;
      },

      // 检查页面是否完全加载
      isPageReady: () => {
        const indicators = [
          '.note-item',
          '.note-detail',
          '[data-v-]', // Vue组件标识
          '.feeds-page'
        ];
        return indicators.some(selector => document.querySelector(selector));
      },

      // 等待页面准备就绪
      waitForPageReady: async (timeout: number = 10000) => {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
          if (antiDetection.isPageReady()) {
            return true;
          }
          
          // 等待一小段时间后再次检查
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.warn('⚠️ 页面准备就绪检查超时');
        return false;
      },

      // 随机化CSS类名
      generateRandomClass: () => {
        const prefixes = ['xhs', 'note', 'helper', 'tool', 'ext'];
        const suffixes = ['btn', 'box', 'wrap', 'item', 'ctrl'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        const random = Math.random().toString(36).substr(2, 4);
        return `${prefix}-${suffix}-${random}`;
      },

      // 模拟鼠标移动
      simulateMouseMovement: (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        const mouseEvent = new MouseEvent('mouseover', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: x + Math.random() * 10 - 5,
          clientY: y + Math.random() * 10 - 5
        });
        
        setTimeout(() => {
          element.dispatchEvent(mouseEvent);
        }, antiDetection.randomDelay(100, 300));
      },

      // 检查是否在可视区域
      isInViewport: (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
      },

      // 随机化样式属性
      randomizeStyles: (element: HTMLElement) => {
        const variations = {
          borderRadius: ['8px', '10px', '12px', '14px'],
          padding: ['14px 22px', '16px 24px', '15px 23px'],
          fontSize: ['14px', '13px', '15px'],
          fontWeight: ['500', '600', 'bold']
        };

        Object.entries(variations).forEach(([prop, values]) => {
          const randomValue = values[Math.floor(Math.random() * values.length)];
          (element.style as any)[prop] = randomValue;
        });
      }
    };

    // 防抖函数
    function debounce<T extends (...args: any[]) => void>(
      func: T, 
      wait: number
    ): (...args: Parameters<T>) => void {
      let timeout: NodeJS.Timeout;
      return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
      };
    }

    // 智能重试机制
    class SmartRetry {
      private attempts = 0;
      private maxAttempts = 5;
      private baseDelay = 1000;
      private antiDetection: any;

      constructor(antiDetectionObj: any) {
        this.antiDetection = antiDetectionObj;
      }

      async execute(fn: () => boolean | Promise<boolean>, context: string): Promise<boolean> {
        while (this.attempts < this.maxAttempts) {
          this.attempts++;
          
          try {
            console.log(`🔄 ${context} - 尝试 ${this.attempts}/${this.maxAttempts}`);
            
            // 等待页面准备就绪
            await this.antiDetection.waitForPageReady();
            
            // 随机延迟
            await new Promise(resolve => 
              setTimeout(resolve, this.antiDetection.randomDelay(500, 1500))
            );
            
            const result = await fn();
            if (result) {
              console.log(`✅ ${context} - 成功`);
              return true;
            }
          } catch (error) {
            console.warn(`⚠️ ${context} - 尝试 ${this.attempts} 失败:`, error);
          }
          
          // 指数退避延迟
          const delay = this.baseDelay * Math.pow(2, this.attempts - 1) + Math.random() * 1000;
          console.log(`⏳ ${context} - 等待 ${Math.round(delay)}ms 后重试`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        console.error(`❌ ${context} - 所有尝试均失败`);
        return false;
      }

      reset() {
        this.attempts = 0;
      }
    }

    // 优化的初始化函数
    function init() {
      console.log('🚀 小红书助手初始化开始');
      
      // 显示使用提示（只显示一次）
      showUsageTip();
      
      // 新的初始化逻辑
      const retry = new SmartRetry(antiDetection);
      
      // 智能添加功能按钮
      async function smartAddButtons(antiDetectionObj: any): Promise<boolean> {
        try {
          console.log('🔍 [DEBUG] smartAddButtons 开始执行');
          console.log('🔍 [DEBUG] 当前URL:', window.location.href);
          
          // 只在笔记详情页执行
          const isNotePage = antiDetectionObj.isNoteDetailPage();
          console.log('🔍 [DEBUG] 页面检测结果:', isNotePage);
          
          if (!isNotePage) {
            console.log('📍 非笔记详情页，跳过按钮添加');
            return true; // 返回true表示操作完成（虽然没有添加按钮）
          }
        
          // 检查是否已存在按钮
          const existingButtons = document.querySelector('.xhs-helper-buttons');
          console.log('🔍 [DEBUG] 已存在的按钮:', existingButtons);
          
          if (existingButtons) {
            console.log('🔄 功能按钮已存在，跳过添加');
            return true;
          }
        
          console.log('🔍 [DEBUG] 等待页面准备就绪...');
          // 等待页面准备就绪
          await antiDetectionObj.waitForPageReady();
          console.log('🔍 [DEBUG] 页面准备就绪完成');
          
          // 分析页面DOM结构
          console.log('🔍 [DEBUG] 分析页面DOM结构...');
          const bodyChildren = Array.from(document.body.children);
          console.log('🔍 [DEBUG] body子元素:', bodyChildren.map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            offsetHeight: (el as HTMLElement).offsetHeight,
            offsetWidth: (el as HTMLElement).offsetWidth
          })));
          
          // 查找可能的容器元素
          const possibleContainers = document.querySelectorAll('div[class*="p-"], div[class*="flex"], div[class*="container"], main, .content, .note');
          console.log('🔍 [DEBUG] 可能的容器元素:', Array.from(possibleContainers).slice(0, 10).map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            offsetHeight: (el as HTMLElement).offsetHeight,
            offsetWidth: (el as HTMLElement).offsetWidth,
            textContent: el.textContent?.substring(0, 50) + '...'
          })));
        
          console.log('🔍 [DEBUG] 开始执行按钮添加重试机制...');
          // 使用智能重试机制添加按钮
          const result = await retry.execute(
            () => addFunctionButtonsToNotePage(),
            '功能按钮添加'
          );
          
          console.log('🔍 [DEBUG] 按钮添加结果:', result);
          
          if (!result) {
            console.error('❌ 功能按钮添加失败，已达到最大重试次数');
          } else {
            console.log('✅ 功能按钮添加成功');
          }
          
          return result;
        } catch (error) {
          console.error('❌ smartAddButtons执行出错:', error);
          return false;
        }
      }

      // 专门处理悬浮弹窗中的按钮添加
      async function smartAddButtonsToModal(modalElement: Element) {
        console.log('🔍 [DEBUG] smartAddButtonsToModal 开始执行', modalElement);
        
        try {
          // 检查扩展上下文
          if (!isExtensionContextValid()) {
            console.warn('⚠️ 扩展上下文失效，跳过按钮添加');
            return false;
          }

          // 检查模态框是否仍然存在且可见
          if (!modalElement || !document.contains(modalElement)) {
            console.warn('⚠️ 模态框已不存在，跳过按钮添加');
            return false;
          }

          // 检查是否已存在功能按钮
          const existingButtons = modalElement.querySelector('.xhs-helper-buttons');
          if (existingButtons) {
            console.log('🔍 [DEBUG] 悬浮弹窗中已存在功能按钮，跳过添加');
            return true;
          }

          // 等待弹窗内容加载完成
          await new Promise(resolve => setTimeout(resolve, 800));

          // 在弹窗中查找合适的插入位置
          const insertTargets = [
            // 查找操作按钮区域
            modalElement.querySelector('.note-actions'),
            modalElement.querySelector('.action-bar'),
            modalElement.querySelector('.toolbar'),
            // 查找底部区域
            modalElement.querySelector('.note-footer'),
            modalElement.querySelector('.bottom-bar'),
            // 查找右侧区域
            modalElement.querySelector('.note-sidebar'),
            modalElement.querySelector('.right-panel'),
            // 查找标题区域
            modalElement.querySelector('.note-header'),
            modalElement.querySelector('.title-bar'),
            // 通用容器
            modalElement.querySelector('div[class*="action"]'),
            modalElement.querySelector('div[class*="button"]'),
            modalElement.querySelector('div[class*="tool"]'),
            // 最后的备选方案
            modalElement.querySelector('div:last-child'),
            modalElement
          ].filter(Boolean);

          console.log('🔍 [DEBUG] 悬浮弹窗中找到的可能插入位置:', insertTargets.length);

          if (insertTargets.length === 0) {
            console.warn('⚠️ 在悬浮弹窗中未找到合适的插入位置');
            return false;
          }

          // 创建功能按钮容器
          const buttonContainer = createFunctionButtons();
          
          // 尝试插入到第一个合适的位置
          const targetElement = insertTargets[0];
          
          if (!targetElement) {
            console.warn('未找到合适的插入位置');
            return false;
          }
          
          // 根据目标元素的类型选择插入方式
          if (targetElement.classList.contains('note-actions') || 
              targetElement.classList.contains('action-bar') ||
              targetElement.classList.contains('toolbar')) {
            // 如果是操作栏，直接添加到其中
            targetElement.appendChild(buttonContainer);
          } else {
            // 否则插入到目标元素之后
            if (targetElement.parentNode) {
              targetElement.parentNode.insertBefore(buttonContainer, targetElement.nextSibling);
            }
          }

          console.log('✅ 成功在悬浮弹窗中添加功能按钮');
          return true;

        } catch (error) {
          console.error('❌ smartAddButtonsToModal执行出错:', error);
          return false;
        }
      }
    
      // 页面变化监听（优化版）
      let lastUrl = window.location.href;
      const urlChangeObserver = new MutationObserver(
        debounce(async (mutations) => {
          // 检查扩展上下文是否有效
          if (!isExtensionContextValid()) {
            console.warn('⚠️ 扩展上下文已失效，停止页面监听');
            urlChangeObserver.disconnect();
            handleContextInvalidation();
            return;
          }

          const currentUrl = window.location.href;
          
          if (currentUrl !== lastUrl) {
            console.log('🔄 URL变化检测:', lastUrl, '->', currentUrl);
            lastUrl = currentUrl;
            
            // 移除旧按钮
            const oldButtons = document.querySelectorAll('.xhs-helper-buttons');
            oldButtons.forEach(btn => btn.remove());
            
            // 重置重试计数器
            retry.reset();
            
            // 延迟后尝试添加新按钮
            setTimeout(async () => {
              if (isExtensionContextValid()) {
                await smartAddButtons(antiDetection);
              }
            }, antiDetection.randomDelay(800, 1500));
          }
        }, 500)
      );
    
      // 悬浮弹窗监听
      let lastModalState = false;
      const modalObserver = new MutationObserver(
        debounce(async (mutations) => {
          // 检查扩展上下文是否有效
          if (!isExtensionContextValid()) {
            console.warn('⚠️ 扩展上下文已失效，停止弹窗监听');
            modalObserver.disconnect();
            handleContextInvalidation();
            return;
          }

          try {
            // 检测悬浮弹窗
            const currentModal = antiDetection.isNoteDetailModal();
            const hasModal = !!currentModal;
            
            // 如果弹窗状态发生变化
            if (hasModal !== lastModalState) {
              console.log('🔍 [DEBUG] 悬浮弹窗状态变化:', { 
                previous: lastModalState, 
                current: hasModal,
                modal: currentModal 
              });
              
              lastModalState = hasModal;
              
              if (hasModal) {
                // 弹窗出现，添加按钮
                console.log('🔍 [DEBUG] 检测到悬浮笔记详情弹窗，准备添加功能按钮');
                
                // 使用重试机制添加按钮
                let retryCount = 0;
                const maxRetries = 3;
                
                const tryAddButton = async () => {
                  if (!isExtensionContextValid()) {
                    console.warn('⚠️ 扩展上下文失效，停止按钮添加');
                    return;
                  }
                  
                  // 重新检查弹窗是否仍然存在
                  const modal = antiDetection.isNoteDetailModal();
                  if (!modal) {
                    console.warn('⚠️ 弹窗已消失，停止按钮添加');
                    return;
                  }
                  
                  const success = await smartAddButtonsToModal(modal);
                  if (!success && retryCount < maxRetries) {
                    retryCount++;
                    console.log(`🔄 按钮添加失败，重试 ${retryCount}/${maxRetries}`);
                    setTimeout(tryAddButton, 1000 * retryCount);
                  } else if (!success) {
                    console.error('❌ 按钮添加最终失败');
                  }
                };
                
                // 延迟添加按钮，确保弹窗内容加载完成
                setTimeout(tryAddButton, 1000);
              }
            }
          } catch (error) {
            console.error('❌ 弹窗监听器执行出错:', error);
          }
        }, 200)
      );

      // 启动监听
      urlChangeObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'data-url']
      });

      // 启动悬浮弹窗监听
      modalObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    
      // 初始化
      (async () => {
        console.log('🚀 小红书助手内容脚本启动');
        console.log('🔍 [DEBUG] 当前页面信息:', {
          url: window.location.href,
          pathname: window.location.pathname,
          search: window.location.search,
          readyState: document.readyState,
          title: document.title
        });
        
        // 检查扩展上下文是否有效
        if (!isExtensionContextValid()) {
          console.warn('⚠️ 扩展上下文已失效，跳过初始化');
          return;
        }
        
        // 等待DOM准备就绪
        if (document.readyState === 'loading') {
          console.log('🔍 [DEBUG] DOM正在加载，等待完成...');
          await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
          });
          console.log('🔍 [DEBUG] DOM加载完成');
        } else {
          console.log('🔍 [DEBUG] DOM已准备就绪');
        }
        
        // 再次检查扩展上下文（防止在等待期间失效）
        if (!isExtensionContextValid()) {
          console.warn('⚠️ 扩展上下文在初始化过程中失效');
          return;
        }
        
        // 显示使用提示
        showUsageTip();
        
        // 智能添加按钮
        console.log('🔍 [DEBUG] 开始执行智能按钮添加...');
        const result = await smartAddButtons(antiDetection);
        console.log('🔍 [DEBUG] 智能按钮添加结果:', result);
      })();
    }

    // 调用初始化函数
    init();
  }
});