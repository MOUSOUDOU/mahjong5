# WebAPI 基本メッセージ形式仕様書

## 概要
本仕様書では、WebAPIで使用する最も基本的なJSON形式のメッセージフォーマットを定義します。

## 基本メッセージ構造

### 1. リクエストメッセージ形式

```json
{
  "version": "1.0",
  "timestamp": "2025-12-14T10:30:00Z",
  "requestId": "req_123456789",
  "method": "POST",
  "endpoint": "/api/v1/resource",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer token_here",
    "User-Agent": "MyApp/1.0"
  },
  "body": {
    "action": "create",
    "data": {
      // リクエスト固有のデータ
    }
  }
}
```

### 2. レスポンスメッセージ形式

#### 成功レスポンス
```json
{
  "version": "1.0",
  "timestamp": "2025-12-14T10:30:01Z",
  "requestId": "req_123456789",
  "status": "success",
  "statusCode": 200,
  "message": "処理が正常に完了しました",
  "data": {
    "id": "resource_001",
    "createdAt": "2025-12-14T10:30:01Z",
    // レスポンス固有のデータ
  },
  "meta": {
    "processingTime": 150,
    "serverVersion": "1.2.3"
  }
}
```

#### エラーレスポンス
```json
{
  "version": "1.0",
  "timestamp": "2025-12-14T10:30:01Z",
  "requestId": "req_123456789",
  "status": "error",
  "statusCode": 400,
  "message": "リクエストの形式が正しくありません",
  "error": {
    "code": "INVALID_REQUEST_FORMAT",
    "details": "必須フィールド 'action' が不足しています",
    "field": "body.action"
  },
  "meta": {
    "processingTime": 50,
    "serverVersion": "1.2.3"
  }
}
```

## フィールド定義

### 共通フィールド

| フィールド名 | 型 | 必須 | 説明 |
|-------------|----|----|------|
| version | string | ○ | APIバージョン（例: "1.0"） |
| timestamp | string | ○ | ISO 8601形式のタイムスタンプ |
| requestId | string | ○ | リクエストの一意識別子 |

### リクエスト固有フィールド

| フィールド名 | 型 | 必須 | 説明 |
|-------------|----|----|------|
| method | string | ○ | HTTPメソッド（GET, POST, PUT, DELETE等） |
| endpoint | string | ○ | APIエンドポイントのパス |
| headers | object | △ | HTTPヘッダー情報 |
| body | object | △ | リクエストボディ（GETの場合は不要） |

### レスポンス固有フィールド

| フィールド名 | 型 | 必須 | 説明 |
|-------------|----|----|------|
| status | string | ○ | 処理結果（"success" または "error"） |
| statusCode | number | ○ | HTTPステータスコード |
| message | string | ○ | 人間が読める形式のメッセージ |
| data | object | △ | 成功時のレスポンスデータ |
| error | object | △ | エラー時の詳細情報 |
| meta | object | △ | メタデータ（処理時間、サーバー情報等） |

### エラーオブジェクト

| フィールド名 | 型 | 必須 | 説明 |
|-------------|----|----|------|
| code | string | ○ | エラーコード（例: "INVALID_REQUEST_FORMAT"） |
| details | string | ○ | エラーの詳細説明 |
| field | string | △ | エラーが発生したフィールド名 |

## ステータスコード

### 成功系
- `200` OK - 正常処理完了
- `201` Created - リソース作成成功
- `204` No Content - 正常処理完了（レスポンスボディなし）

### エラー系
- `400` Bad Request - リクエストの形式エラー
- `401` Unauthorized - 認証エラー
- `403` Forbidden - 権限エラー
- `404` Not Found - リソースが見つからない
- `500` Internal Server Error - サーバー内部エラー

## 使用例

### ユーザー作成リクエスト
```json
{
  "version": "1.0",
  "timestamp": "2025-12-14T10:30:00Z",
  "requestId": "req_user_create_001",
  "method": "POST",
  "endpoint": "/api/v1/users",
  "body": {
    "action": "create",
    "data": {
      "name": "田中太郎",
      "email": "tanaka@example.com",
      "role": "user"
    }
  }
}
```

### ユーザー作成成功レスポンス
```json
{
  "version": "1.0",
  "timestamp": "2025-12-14T10:30:01Z",
  "requestId": "req_user_create_001",
  "status": "success",
  "statusCode": 201,
  "message": "ユーザーが正常に作成されました",
  "data": {
    "id": "user_001",
    "name": "田中太郎",
    "email": "tanaka@example.com",
    "role": "user",
    "createdAt": "2025-12-14T10:30:01Z"
  },
  "meta": {
    "processingTime": 200,
    "serverVersion": "1.2.3"
  }
}
```

## 注意事項

1. **文字エンコーディング**: すべてのJSON文字列はUTF-8でエンコードする
2. **日時形式**: ISO 8601形式（YYYY-MM-DDTHH:mm:ssZ）を使用する
3. **リクエストID**: 各リクエストに一意のIDを付与し、ログ追跡を可能にする
4. **エラーハンドリング**: エラー時は適切なHTTPステータスコードと詳細なエラー情報を返す
5. **バージョニング**: APIバージョンを明示し、後方互換性を保つ

## 拡張性

この基本形式は以下のように拡張可能です：

- `pagination`: ページネーション情報の追加
- `validation`: バリデーションエラーの詳細情報
- `security`: セキュリティ関連の追加ヘッダー
- `monitoring`: モニタリング用の追加メタデータ

---

**作成日**: 2025年12月14日  
**バージョン**: 1.0  
**作成者**: Kiro AI Assistant