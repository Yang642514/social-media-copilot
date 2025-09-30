import { defineContentScript } from 'wxt/sandbox';

// 笔记数据接口
interface NoteData {
  title: string;
  author: string;
  likes: number;
  comments: number;
  shares: number;
  publishTime: string;
  recommendLevel: 'high' | 'medium' | 'low';
  likeFollowRatio: number;
  followerCount: number;
  noteScore: number;
  images?: string[]; // 笔记图片URL数组
  content?: string;  // 笔记文本内容
  tags?: string[];   // 笔记标签数组
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
    // 创建功能按钮容器（模仿小红书原生布局）
    function createFunctionButtons(): HTMLElement {
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'xhs-helper-buttons';
      
      // 模仿小红书原生按钮容器样式
      buttonContainer.style.cssText = `
        padding: 16px 24px;
        padding-top: 0;
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
        position: relative;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.3s ease;
        z-index: 1000;
        box-sizing: border-box;
      `;

      // 直接创建按钮（模仿小红书原生布局）
      const loadActualContent = () => {

        // 创建操作按钮的辅助函数（模仿小红书原生按钮样式）
        const createActionButton = (text: string, color: string, onClick: () => void) => {
          const button = document.createElement('button');
          button.type = 'button';
          
          // 创建按钮内容span
          const span = document.createElement('span');
          span.textContent = text;
          button.appendChild(span);
          
          // 应用小红书原生按钮样式
          button.className = 'smzs-btn css-1n2561v smzs-btn-primary smzs-btn-color-primary smzs-btn-variant-solid';
          button.style.cssText = `
            outline: none;
            position: relative;
            display: inline-flex;
            gap: 8px;
            align-items: center;
            justify-content: center;
            font-weight: 400;
            white-space: nowrap;
            text-align: center;
            background-image: none;
            background: ${color};
            border: 1px solid transparent;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
            user-select: none;
            touch-action: manipulation;
            color: #fff;
            font-size: 14px;
            height: 32px;
            padding: 0px 15px;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
            box-sizing: border-box;
          `;

          // 悬停效果（模仿小红书原生效果）
          button.addEventListener('mouseenter', () => {
            button.style.background = color === '#3d61ff' ? '#6687ff' : 
                                    color === '#52c41a' ? '#73d13d' : 
                                    color === '#ff4d4f' ? '#ff7875' : color;
          });

          button.addEventListener('mouseleave', () => {
            button.style.background = color;
          });

          // 点击效果
          button.addEventListener('mousedown', () => {
            button.style.background = color === '#3d61ff' ? '#2944d9' : 
                                    color === '#52c41a' ? '#389e0d' : 
                                    color === '#ff4d4f' ? '#d9363e' : color;
          });

          button.addEventListener('mouseup', () => {
            button.style.background = color;
          });

          button.addEventListener('click', onClick);
          return button;
        };

        // 直接创建功能按钮
        const syncButton = createActionButton('同步飞书', '#3d61ff', handleSyncNote);
        const copyButton = createActionButton('复制笔记信息', '#52c41a', handleCopyNote);

        buttonContainer.appendChild(syncButton);
        buttonContainer.appendChild(copyButton);

        // 渐进式显示动画
        requestAnimationFrame(() => {
          buttonContainer.style.opacity = '1';
          buttonContainer.style.transform = 'translateY(0)';
        });
      };

      // 立即加载按钮
      loadActualContent();

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

    // 提取笔记数据
    function extractNoteData(): NoteData {
      // 获取标题
      const titleElement = document.querySelector('#detail-title') || 
                      document.querySelector('[data-testid="note-title"]') ||
                      document.querySelector('.note-detail-title') ||
                      document.querySelector('h1');
      const title = titleElement?.textContent?.trim() || '未知标题';
    
      // 获取作者信息
      const authorElement = document.querySelector('.user-name') ||
                       document.querySelector('[data-testid="author-name"]') ||
                       document.querySelector('.author-info .name') ||
                       document.querySelector('.username');
      const author = authorElement?.textContent?.trim() || '未知作者';
    
      // 获取互动数据
      const likeElement = document.querySelector('.like-count') ||
                     document.querySelector('[data-testid="like-count"]') ||
                     document.querySelector('.engagement-count:first-child') ||
                     document.querySelector('.interact-count .like');
      const likes = parseNumber(likeElement?.textContent || '0');
    
      const commentElement = document.querySelector('.comment-count') ||
                        document.querySelector('[data-testid="comment-count"]') ||
                        document.querySelector('.engagement-count:nth-child(2)') ||
                        document.querySelector('.interact-count .comment');
      const comments = parseNumber(commentElement?.textContent || '0');
    
      const shareElement = document.querySelector('.share-count') ||
                      document.querySelector('[data-testid="share-count"]') ||
                      document.querySelector('.engagement-count:nth-child(3)') ||
                      document.querySelector('.interact-count .share');
      const shares = parseNumber(shareElement?.textContent || '0');
    
      // 获取发布时间
      const timeElement = document.querySelector('.publish-time') ||
                     document.querySelector('[data-testid="publish-time"]') ||
                     document.querySelector('.time') ||
                     document.querySelector('.date');
      const publishTime = timeElement?.textContent?.trim() || new Date().toLocaleDateString();
    
      // 获取作者粉丝数（需要进入作者页面或从现有信息推断）
      const followerElement = document.querySelector('.follower-count') ||
                         document.querySelector('[data-testid="follower-count"]') ||
                         document.querySelector('.fans-count');
      const followerCount = parseNumber(followerElement?.textContent || '0');
    
      // 计算赞粉比（点赞数/粉丝数）
      const likeFollowRatio = followerCount > 0 ? Number((likes / followerCount).toFixed(4)) : 0;
    
      // 计算笔记评分（基于互动数据的综合评分）
      const noteScore = calculateNoteScore(likes, comments, shares, followerCount);

      // 提取笔记图片
      const images = extractNoteImages();

      // 提取笔记内容
      const rawContent = extractNoteContent();

      // 提取笔记标签
      const tags = extractNoteTags();

      // 清理正文中的标签，避免重复显示
      const content = cleanContentFromTags(rawContent, tags);
    
      return {
        title,
        author,
        likes,
        comments,
        shares,
        publishTime,
        recommendLevel: 'medium', // 默认值，用户可以修改
        likeFollowRatio,
        followerCount,
        noteScore,
        images,
        content,
        tags
      };
    }

    // 提取笔记图片
    function extractNoteImages(): string[] {
      const images: string[] = [];
      
      // 尝试多种选择器来获取图片
      const imageSelectors = [
        '.note-detail-img img',
        '.note-content img',
        '.swiper-slide img',
        '.image-container img',
        '[data-testid="note-image"]',
        '.note-scroller img'
      ];

      for (const selector of imageSelectors) {
        const imageElements = document.querySelectorAll(selector);
        if (imageElements.length > 0) {
          imageElements.forEach((img: Element) => {
            const imgElement = img as HTMLImageElement;
            let src = imgElement.src || imgElement.getAttribute('data-src') || imgElement.getAttribute('data-original');
            
            if (src && !images.includes(src)) {
              // 确保是完整的URL
              if (src.startsWith('//')) {
                src = 'https:' + src;
              } else if (src.startsWith('/')) {
                src = 'https://www.xiaohongshu.com' + src;
              }
              images.push(src);
            }
          });
          break; // 找到图片就停止搜索
        }
      }

      console.log('提取到的图片:', images);
      return images;
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
          const content = contentElement.textContent?.trim();
          if (content) {
            console.log('提取到的内容:', content);
            return content;
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
    function updateDataDisplay(noteData: NoteData): void {
      // 更新赞粉比显示
      const likeFollowRatioElement = document.getElementById('like-follow-ratio');
      if (likeFollowRatioElement) {
        likeFollowRatioElement.innerHTML = `赞粉比: <strong>${noteData.likeFollowRatio.toFixed(2)}%</strong>`;
      }
    
      // 更新粉丝量显示
      const followerCountElement = document.getElementById('follower-count');
      if (followerCountElement) {
        followerCountElement.innerHTML = `粉丝: <strong>${formatNumber(noteData.followerCount)}</strong>`;
      }
    
      // 更新笔记评分显示
      const noteScoreElement = document.getElementById('note-score');
      if (noteScoreElement) {
        noteScoreElement.innerHTML = `评分: <strong>${noteData.noteScore}/100</strong>`;
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
          config: config
        });
        
        if (response && response.success) {
          showMessage('笔记同步成功！', 'success');
        } else {
          showMessage(`同步失败: ${response?.error || '未知错误'}`, 'error');
        }
      } catch (error) {
        console.error('同步笔记时出错:', error);
        if (error.message && error.message.includes('Extension context invalidated')) {
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

      console.log('🔍 [DEBUG] 开始查找插入位置...');
      
      // 查找合适的插入位置（基于实际案例优化选择器）
      const selectors = [
        // 优先查找按钮容器区域（基于实际案例）
        '.p-4.xl\\:p-6',                    // 实际案例中的按钮容器
        'div[class*="p-4"][class*="xl:p-6"]', // 更宽泛的匹配
        'div[class*="flex"][class*="gap-3"]', // 按钮布局容器
        '.note-content',                     // 笔记内容区域
        '.note-detail',                      // 笔记详情区域
        '.note-scroller',                    // 笔记滚动容器
        '.note-item',                        // 笔记项目
        '[data-v-] .note-content',          // Vue组件中的笔记内容
        '[data-v-] .note-detail'            // Vue组件中的笔记详情
      ];

      let insertTarget: Element | null = null;
      
      for (const selector of selectors) {
        console.log(`🔍 [DEBUG] 尝试选择器: ${selector}`);
        const elements = document.querySelectorAll(selector);
        console.log(`🔍 [DEBUG] 找到 ${elements.length} 个元素`);
        
        for (const element of elements) {
          console.log(`🔍 [DEBUG] 检查元素:`, element, `可见性: ${element.offsetHeight}x${element.offsetWidth}`);
          // 检查元素是否可见且有内容
          if (element.offsetHeight > 0 && element.offsetWidth > 0) {
            insertTarget = element;
            console.log(`✅ 找到内容容器: ${selector}`, element);
            break;
          }
        }
        if (insertTarget) break;
      }
      
      console.log('🔍 [DEBUG] 最终插入目标:', insertTarget);

      if (insertTarget) {
        const functionButtons = createFunctionButtons();
        
        // 应用防检测机制
        const randomClass = antiDetection.generateRandomClass();
        functionButtons.className = `xhs-helper-buttons ${randomClass}`;
        
        // 随机化样式
        antiDetection.randomizeStyles(functionButtons);
        
        // 插入到容器的开头
        if (insertTarget.firstChild) {
          insertTarget.insertBefore(functionButtons, insertTarget.firstChild);
        } else {
          insertTarget.appendChild(functionButtons);
        }
        
        // 模拟自然的加载过程
        setTimeout(() => {
          // 初始化数据显示
          const noteData = extractNoteData();
          if (noteData) {
            updateDataDisplay(noteData);
          }
          
          // 模拟鼠标移动
          antiDetection.simulateMouseMovement(functionButtons);
        }, antiDetection.randomDelay(200, 500));

        console.log('✅ 功能按钮已添加到笔记详情页', insertTarget);
        return true;
      } else {
        console.log('⚠️ 未找到合适的插入位置，尝试更多备用位置');
        
        // 备用方案：尝试更多可能的插入位置
        const backupSelectors = [
          'main',
          '.container',
          '.content',
          '.page-container',
          '.app',
          '#app',
          '.layout',
          'body > div:first-child',
          'body > div:nth-child(2)'
        ];
        
        for (const selector of backupSelectors) {
          const element = document.querySelector(selector);
          if (element && element.offsetHeight > 0) {
            const functionButtons = createFunctionButtons();
            const randomClass = antiDetection.generateRandomClass();
            functionButtons.className = `xhs-helper-buttons ${randomClass}`;
            
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
                updateDataDisplay(noteData);
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
            offsetHeight: el.offsetHeight,
            offsetWidth: el.offsetWidth
          })));
          
          // 查找可能的容器元素
          const possibleContainers = document.querySelectorAll('div[class*="p-"], div[class*="flex"], div[class*="container"], main, .content, .note');
          console.log('🔍 [DEBUG] 可能的容器元素:', Array.from(possibleContainers).slice(0, 10).map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            offsetHeight: el.offsetHeight,
            offsetWidth: el.offsetWidth,
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
      async function smartAddButtonsToModal(modalElement) {
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
          const buttonContainer = createButtonContainer();
          
          // 尝试插入到第一个合适的位置
          const targetElement = insertTargets[0];
          
          // 根据目标元素的类型选择插入方式
          if (targetElement.classList.contains('note-actions') || 
              targetElement.classList.contains('action-bar') ||
              targetElement.classList.contains('toolbar')) {
            // 如果是操作栏，直接添加到其中
            targetElement.appendChild(buttonContainer);
          } else {
            // 否则插入到目标元素之后
            targetElement.parentNode.insertBefore(buttonContainer, targetElement.nextSibling);
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