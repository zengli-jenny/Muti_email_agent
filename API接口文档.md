# TCS API 接口文档

> **Base URL:** `https://tcs.1000shores.cn`
>
> **认证方式:** 所有请求需在 Header 中携带 Bearer Token
>
> ```
> Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxMDAiLCJqdGkiOiI3M2VmNmM1YjRkMGQ0OWJiNTU3NTA3YmI0YzkwZmI4OTAyNmU2MzExN2E4YjE5YmZjMDM1OTVlMDQyNjc5NDhkNzI5MGE2ZmU5OGU0OTM4ZCIsImlhdCI6MTc1Mzg3NTkwNi40NTM1NTIsIm5iZiI6MTc1Mzg3NTkwNi40NTM1NTQsImV4cCI6NDkwOTU0OTUwNi40MzY5MTYsInN1YiI6IiIsInNjb3BlcyI6W119.oDW6VeqKbHSwJ58TuXL2rTxxStRwfoWgwPHACU9dUw_WJvYI6y-HEtNrLreBCR_Fwn3uk1xFqJ-Pym2JImftyITDlenV6vBwqONJ3rdm5kOURfQtUqyWT53I-QgpFyxv-rKFaztWVSTH8jaVVAoc5ACwp9qMaHcZi3AWY-gUVspVr8kOU5tVWmL0pojgZ97h4TlHJDsauVXig0Wu6Ro6dUTNFgwTgC0YbRkvwN8yGQWrDgNayoi2temSx1NnzpD-A2ItTRKwzj6yM9GtWUcHNhygh997NgTzSYi6o3yHq92rXg_OBgKeLhb3iIXAkRTw5Jhnmyi6fHZEKHoawypntA
> ```

---

## 1. 通过官网链接查询产品SKU

| 项目 | 说明 |
|------|------|
| **接口名称** | 通过官网链接查询产品SKU |
| **接口路径** | `/client/sku/match` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 通过官网产品链接查询对应的产品SKU。官网域名：https://www.tribit.com、https://www.ohuhu.com |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| url | String | 必填 | Body | 官网的产品链接 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object | 查询结果 |
| data.sku | String | 产品的SKU |

---

## 2. 通过SKU查询产品信息

| 项目 | 说明 |
|------|------|
| **接口名称** | 通过SKU查询产品信息 |
| **接口路径** | `/client/sku/sku` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 通过SKU查询产品详细信息，包括产品SKU、型号、中文关键词、BU、品线。若产品是画马克笔则包括系列、旧SKU、系列1、系列2、笔尖、马克笔总支数、色系、包含色号(旧)、包含色号(新)等信息。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| sku | Array\<String\> | 必填 | Body | 产品SKU |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Array\<Object\> | 查询结果 |
| data[].sku | String | 产品SKU |
| data[].keyword_cn | String | 中文关键词 |
| data[].product_model | String | 型号 |
| data[].bu | String | BU |
| data[].product_line | String | 品线 |
| data[].origin_sku | String | 旧SKU |
| data[].series | String | 系列 |
| data[].series_1 | String | 系列1 |
| data[].series_2 | String | 系列2 |
| data[].penpoint | String | 笔尖 |
| data[].pack | String | 数量（pack数） |
| data[].color_series | String | 色系 |
| data[].colors | String | 包含色号(新) |
| data[].origin_colors | String | 包含色号(旧) |

---

## 3. 通过品牌查询渠道

| 项目 | 说明 |
|------|------|
| **接口名称** | 通过品牌查询渠道 |
| **接口路径** | `/client/repository/website-channel` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 通过品牌查询渠道 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| brand | String | 必填 | Body | 品牌 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Array\<Object\> | 查询结果 |
| data[].channel | String | 渠道 |
| data[].brand | String | 品牌 |
| data[].country | String | 国家 |
| data[].warehouse_description | String | 仓库描述 |

---

## 4. 查询关联订单基本信息

| 项目 | 说明 |
|------|------|
| **接口名称** | 查询关联订单基本信息 |
| **接口路径** | `/client/order-relations` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 根据订单号查询关联订单基本信息，可以获取到当前订单的关联订单信息。如果订单号为空则不要调用。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| order_id | String | 必填 | Body | 订单号，订单唯一编 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object | 查询结果 |
| data.purchased_from | String | 采源账号 |
| data.channel | String | 渠道 |
| data.platform | String | 渠道对应平台 |
| data.platform_country | String | 渠道对应国家 |
| data.status | String | 订单状态 |
| data.fulfillment_channel | String | 发货类型，AFN为亚马逊发货 |
| data.warehouse | String | 发货仓库 |
| data.warehouse_country | String | 发货仓库所在国家 |
| data.warehouse_attr | String | 发货仓库属性（如自有仓、FBA） |
| data.tracking_number | Array\<String\> | 物流跟踪号 |
| data.sku | Array\<String\> | 产品SKU |
| data.replace_status | String | 订单进换货状态 |
| data.shipping_date | String | 订单发货时间 |
| data.mail_class | String | 物流公司 |
| data.ship_country | String | 收件人国家 |
| data.address | String | 收件详细地址 |

---

## 5. 查询订单补充信息

| 项目 | 说明 |
|------|------|
| **接口名称** | 查询订单补充信息 |
| **接口路径** | `/client/order-extension` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 在售后场景中，通过订单号获取货值（商品售价）、保修周期、是否在保、缩格TP1与运费差价等数据。如果订单号为空则不要调用。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| order_id | String | 必填 | Body | 订单号，订单唯一编 |
| sku | String | 必填 | Body | 产品SKU，公司内部 |
| end_date | String | 必填 | Body | 当前会话客户首次发 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object | 查询结果 |
| data.subtotal | String | 订单的货值 |
| data.warranty | String | 保修周期（月） |
| data.in_warranty | String | 是否在保（是、否） |
| data.difference_shipping_fee | String | 缩格TP1与运费差价 |
| data.is_new | String | 货品类型（新品/旧品） |
| data.refund | String | 退款状态 |

---

## 6. 通过ASIN查询SKU

| 项目 | 说明 |
|------|------|
| **接口名称** | 通过ASIN查询SKU |
| **接口路径** | `/client/sku/get-sku-by-asin` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 通过ASIN查询SKU |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| asin | String | 必填 | Body | 亚马逊ASIN |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Array\<Object\> | 查询结果 |
| data[].asin | String | 亚马逊ASIN |
| data[].sku | String | 产品SKU |

---

## 7. TSM客服邮箱查询工具

| 项目 | 说明 |
|------|------|
| **接口名称** | TSM客服邮箱查询工具 |
| **接口路径** | `/client/repository/email-account` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 通过邮箱账号查询渠道。邮箱账号必填。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| email | String | 必填 | Body | 邮箱账号 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Array\<Object\> | 返回结果 |
| data[].email | String | 邮箱账号 |
| data[].type | String | 邮箱类型 |
| data[].brand | String | 品牌 |
| data[].channel | String | 渠道 |
| data[].country | String | 国家 |
| data[].seller | String | 后台店铺名称 |
| data[].name | String | 邮箱名称 |
| data[].promotional_email | String | 品牌推广邮箱 |
| data[].website_url | String | 官网链接 |

---

## 8. 查询拆单订单号

| 项目 | 说明 |
|------|------|
| **接口名称** | 查询拆单订单号 |
| **接口路径** | `/client/order-splitting` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 因为拆单导致客户收到了包裹或订单的一部分。特殊情况，临时用。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| order_id | String | 必填 | Body | 订单号 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object | 查询结果 |
| data.order_id | String | 拆单订单号 |
| data.message | String | 信息 |

---

## 9. 查询订单基本信息

| 项目 | 说明 |
|------|------|
| **接口名称** | 查询订单基本信息 |
| **接口路径** | `/client/order` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 通过订单号获取订单基本信息，可以获取到购买渠道、购买平台、客户国家、订单状态、订单进换货状态、发货类型、物流公司、物流跟踪号、购买的产品SKU、发货时间、收件人信息等关键信息。如果订单号为空则不要调用。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| order_id | String | 必填 | Body | 订单号，订单唯一编 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object | 查询结果 |
| data.purchased_from | String | ERP账号 |
| data.channel | String | 渠道 |
| data.platform | String | 渠道对应平台 |
| data.platform_country | String | 渠道对应国家 |
| data.status | String | 订单状态 |
| data.fulfillment_channel | String | 发货类型，AFN为亚马逊发货 |
| data.warehouse | String | 发货仓库 |
| data.warehouse_country | String | 发货仓库所在国家 |
| data.warehouse_attr | String | 发货仓库属性（如自有仓、FBA） |
| data.tracking_number | Array\<String\> | 物流跟踪号 |
| data.sku | Array\<String\> | 产品SKU |
| data.replace_status | String | 订单进换货状态 |
| data.shipping_date | String | 订单发货时间 |
| data.carrier_code | String | 物流商 |
| data.ship_country | String | 收件人国家 |
| data.address | String | 收件详细地址 |
| data.purchased_from_country | String | ERP账号对应国家 |
| data.replace_orders | Array\<String\> | 换货（重发）订单号 |
| data.split_orders | Array\<String\> | 拆单订单号 |
| data.order_id | String | 订单号 |

---

## 10. 查询库存信息

| 项目 | 说明 |
|------|------|
| **接口名称** | 查询库存信息 |
| **接口路径** | `/client/sku/sku-stock` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 通过服务阶段、产品SKU、渠道、国家查询产品的库存信息。如果SKU、渠道为空，则不要调用。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| sale_type | String | 必填 | Body | 服务阶段，根据Basic判断 |
| sku | Array\<String\> | 必填 | Body | 产品SKU，公司内部 |
| channel | String | 必填 | Body | 渠道，公司内部对销售渠道的命名 |
| country_code | String | 非必填 | Body | 客户所在国家或者渠道对应的国家代码 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Array\<Object\> | 返回结果数组 |
| data[].sku | String | 产品SKU |
| data[].type | String | 库存情况（在库有货、在途有货等） |
| data[].stock | String | 库存数量 |
| data[].warehouse | String | 有库存的仓库 |
| data[].arrival_date | String | 最近到货时间 |
| data[].message | String | 查询过程出现的错误信息 |

---

## 11. 查询物流信息

| 项目 | 说明 |
|------|------|
| **接口名称** | 查询物流信息 |
| **接口路径** | `/client/order-tracking` |
| **请求方法** | POST |
| **Content-Type** | application/json |
| **接口描述** | 在售后阶段，通过跟踪号查询物流详细信息，包括物流状态、最近更新时间、最新跟踪信息、跟踪链接、投递时间等数据。如果跟踪号为空或者发货类型（fulfillment_channel）为AFN，则不要调用。 |

### 请求参数（Body）

| 参数名 | 类型 | 是否必填 | 传参方式 | 说明 |
|--------|------|----------|----------|------|
| tracking_number | String | 必填 | Body | 物流跟踪号 |
| carrier_code | String | 非必填 | Body | 物流商 |

### 响应参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object | 查询结果 |
| data.status | String | 物流状态 |
| data.latest_time | String | 最新更新时间 |
| data.latest_event | String | 最新跟踪信息 |
| data.scheduled_delivery_date | String | 预计到达时间 |
| data.carrier_url | String | 物流商地址 |
| data.tracking_url | String | 跟踪链接 |
