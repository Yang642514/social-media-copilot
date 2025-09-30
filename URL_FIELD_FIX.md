# 飞书URL字段格式修复

## 问题描述

在同步数据到飞书多维表格时，遇到以下错误：

```
❌ 飞书API错误: { 
  "code": 1254068, 
  "msg": "URLFieldConvFail", 
  "error": { 
    "message": "Invalid request parameter: 'fields.笔记链接.fieldValue. `https://www.xiaohongshu.com/explore/66fa9f53000000001b021d6e?xsec_token=ABQy6urfMVK-I04YsAYle2BhOn41IvCWpaDK6wgNMoUrc=&xsec_source=pc_search&source=web_explore_feed.fieldName.笔记链接` '. Correct format : the value of 'Link' must be an object. Please check and modify accordingly."
  } 
}
```

## 问题原因

飞书多维表格的URL字段（超链接字段）要求传入的值必须是一个对象，包含以下属性：
- `link`: 实际的URL链接
- `text`: 显示的文本

而我们之前直接传入了字符串格式的URL，导致API调用失败。

## 解决方案

### 修改前的代码
```typescript
// 错误的格式 - 直接传入字符串
if (syncFields.noteUrl) data['笔记链接'] = noteData.noteUrl || currentUrl;
if (syncFields.authorUrl) data['博主链接'] = noteData.authorUrl || '';
```

### 修改后的代码
```typescript
// 正确的格式 - 传入对象
if (syncFields.noteUrl) {
  const noteUrl = noteData.noteUrl || currentUrl;
  data['笔记链接'] = {
    link: noteUrl,
    text: noteData.title || '查看笔记'
  };
}

if (syncFields.authorUrl) {
  const authorUrl = noteData.authorUrl || '';
  if (authorUrl) {
    data['博主链接'] = {
      link: authorUrl,
      text: noteData.author || '查看博主'
    };
  } else {
    data['博主链接'] = {
      link: '',
      text: ''
    };
  }
}
```

## 修复内容

1. **笔记链接字段**：
   - `link`: 使用笔记的实际URL
   - `text`: 使用笔记标题作为显示文本，如果没有标题则使用"查看笔记"

2. **博主链接字段**：
   - `link`: 使用博主的实际URL
   - `text`: 使用博主昵称作为显示文本，如果没有昵称则使用"查看博主"
   - 如果没有博主URL，则传入空的link和text

## 飞书URL字段格式规范

根据飞书API文档，URL字段（超链接字段）的正确格式为：

```json
{
  "link": "https://example.com",
  "text": "显示文本"
}
```

其中：
- `link`: 必须是有效的URL字符串
- `text`: 显示在表格中的文本，用户点击此文本会跳转到对应链接

## 测试建议

1. 在小红书页面测试数据同步功能
2. 检查飞书表格中的链接字段是否正确显示
3. 点击链接确认能够正确跳转
4. 验证不同类型的笔记（有/无标题、有/无博主链接）的处理

## 注意事项

- 确保传入的URL是有效的格式
- 显示文本不能为空，如果没有合适的文本，使用默认文本
- 空链接也需要传入对象格式，而不是null或undefined