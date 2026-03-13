# 多专家 Agent 客服系统 - 测试用例

## 测试场景 1: 物流问题

### 请求
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "alice@example.com",
    "brand": "ohuhu",
    "subject": "Package not received",
    "body": "Hi, my order #OHU290027 shows delivered but I did not receive it. Can you help?",
    "auto_execute": false
  }'
```

### 预期结果
- 路由到: `物流问题处理流程.md`
- 专家: `LogisticsExpert`
- 工具调用: `query_order`, `track_logistics`
- 回复: 提供物流信息,建议检查邻居/信箱

---

## 测试场景 2: 商品质量问题

### 请求
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "bob@example.com",
    "brand": "tribit",
    "subject": "Speaker not working",
    "body": "I received my order #TRB123456 yesterday, but the speaker won'\''t turn on. I tried charging it but nothing happens.",
    "auto_execute": false
  }'
```

### 预期结果
- 路由到: `商品质量问题处理流程.md`
- 专家: `QualityExpert`
- 工具调用: `query_order`, `check_inventory`
- 回复: 提供技术支持步骤,或提供换货/退款方案

---

## 测试场景 3: 马克笔质量问题

### 请求
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "carol@example.com",
    "brand": "ohuhu",
    "subject": "Markers dried out",
    "body": "I bought the Ohuhu 120 marker set (order #OHU456789) last month. Now 5 markers are completely dried out: R2, R5, B3, G7, Y1. Can you replace them?",
    "auto_execute": false
  }'
```

### 预期结果
- 路由到: `马克笔质量问题处理流程.md`
- 专家: `MarkerQualityExpert`
- 工具调用: `query_order`, `查询包含部分问题色号套装`
- 回复: 提供单支笔换货或套装换货方案

---

## 测试场景 4: 售前咨询

### 请求
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "david@example.com",
    "brand": "iclever",
    "subject": "Product compatibility question",
    "body": "Hi, I'\''m interested in the iClever keyboard. Does it work with iPad Pro 2024? Also, what'\''s the battery life?",
    "auto_execute": false
  }'
```

### 预期结果
- 路由到: `售前咨询处理流程.md`
- 专家: `PreSalesExpert`
- 工具调用: `知识检索工具`
- 回复: 提供产品兼容性和规格信息

---

## 测试场景 5: 问题已解决

### 请求
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "eve@example.com",
    "brand": "ohuhu",
    "subject": "Re: Refund request",
    "body": "Thank you so much! I received the refund today. Everything is resolved. Thanks for your help!",
    "auto_execute": false
  }'
```

### 预期结果
- 路由到: `问题已解决回复要求.md`
- 专家: `ResolvedExpert`
- 工具调用: 无
- 回复: 简短的感谢回复

---

## 测试场景 6: 多意图邮件

### 请求
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "frank@example.com",
    "brand": "ohuhu",
    "subject": "Multiple issues",
    "body": "Hi, I have two questions: 1) My order #OHU789012 hasn'\''t arrived yet, can you check the tracking? 2) I also want to know if you have the 320 marker set in stock for my next purchase. Thanks!",
    "auto_execute": false
  }'
```

### 预期结果
- 路由到: `物流问题处理流程.md`, `售前咨询处理流程.md`
- 专家: `LogisticsExpert`, `PreSalesExpert`
- 工具调用: `query_order`, `track_logistics`, `check_inventory`
- 回复: 整合两个专家的回复

---

## 测试系统信息

### 请求
```bash
curl http://127.0.0.1:8000/info
```

### 预期结果
```json
{
  "architecture": "Multi-Agent Expert System",
  "available_experts": [
    "物流问题处理流程.md",
    "商品质量问题处理流程.md",
    "马克笔质量问题处理流程.md",
    "售前咨询处理流程.md"
  ],
  "policies_dir": "C:\\Users\\Administrator\\Desktop\\新建文件夹\\标准流程",
  "version": "2.0.0"
}
```

---

## 性能测试

### 并发测试
```bash
# 使用 Apache Bench 进行并发测试
ab -n 100 -c 10 -p test_payload.json -T application/json http://127.0.0.1:8000/reply
```

### 预期指标
- 平均响应时间: < 2 秒
- 成功率: > 95%
- 并发处理能力: 10 QPS

---

## 错误处理测试

### 缺少必填字段
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "test@example.com",
    "brand": "ohuhu"
  }'
```

### 预期结果
```json
{
  "error": "Missing required fields: body, subject"
}
```

---

## 人工介入测试

### 复杂场景
```bash
curl -X POST http://127.0.0.1:8000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "complex@example.com",
    "brand": "ohuhu",
    "subject": "Complaint",
    "body": "This is unacceptable! I ordered 3 weeks ago and still nothing. I want a full refund AND compensation for my time. I will leave a negative review if this is not resolved immediately!",
    "auto_execute": false
  }'
```

### 预期结果
- `requires_human`: true
- `human_tasks`: ["客户情绪激动,需要人工处理", "涉及补偿要求"]
- `confidence`: < 0.7
