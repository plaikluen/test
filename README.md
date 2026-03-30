# Signature Hunt Finder

เว็บสำหรับกิจกรรมล่าลายเซ็น: ให้ผู้เข้าร่วมเพิ่มชื่อ, รูปภาพ (ไม่บังคับ), ลิงก์ Bluesky/โพสต์โรลเพลย์ และเลือกคุณลักษณะ เพื่อให้คนอื่นค้นหาได้ง่าย

## Features
- เพิ่มข้อมูลผู้เข้าร่วมผ่านฟอร์มหน้าเว็บ
- อัปโหลดรูปภาพ (ไม่บังคับ, สูงสุด 5MB)
- ค้นหาจากชื่อ, แท็ก, หรือข้อความในลิงก์
- กรองตามคุณลักษณะ
- แสดงหมวดหมู่เป็นชิปพร้อมจำนวนคนในแต่ละแท็ก
- ผู้ชมเว็บสามารถเพิ่มตัวเลือกคุณลักษณะใหม่ได้ทันที
- เจ้าของโพสต์ลบโพสต์ตัวเองได้ด้วยรหัสลบโพสต์
- บันทึกข้อมูลลง SQLite แบบถาวรในเครื่อง

## Stack
- Node.js + Express
- SQLite
- Vanilla HTML/CSS/JavaScript

## วิธีรัน
1. ติดตั้ง dependency

```bash
npm install
```

2. เริ่มเซิร์ฟเวอร์

```bash
npm start
```

3. เปิดเว็บที่

```text
http://localhost:3000
```

## Deploy แบบออนไลน์ (Render + GitHub Pages)

### 1) Deploy API ที่ Render
1. เปิด Render และเลือก `New +` -> `Blueprint`
2. เลือก repo นี้ แล้วให้ Render ใช้ไฟล์ `render.yaml`
3. รอ deploy เสร็จ แล้วคัดลอก URL ของ service
  - ตัวอย่าง: `https://event1-api.onrender.com`

### 2) เชื่อมหน้าเว็บบน GitHub Pages เข้ากับ API
เปิดหน้าเว็บด้วยพารามิเตอร์ `apiBase` หนึ่งครั้ง เช่น

```text
https://plaikluen.github.io/test/?apiBase=https://event1-api.onrender.com
```

ระบบจะจำค่า API URL ไว้ใน browser (`localStorage`) อัตโนมัติ

### 3) ล้างค่า API URL (ถ้าต้องการเปลี่ยน)
เปิด DevTools Console แล้วรัน

```js
localStorage.removeItem("event1-api-base")
```

## ปรับรายการคุณลักษณะ
แก้ที่ตัวแปร `DEFAULT_TRAITS` ในไฟล์ `server.js` แล้วรีสตาร์ตเซิร์ฟเวอร์

## API คร่าว ๆ
- `GET /api/traits` คืนรายการคุณลักษณะ
- `POST /api/traits` เพิ่มตัวเลือกคุณลักษณะใหม่
  - body JSON: `{ "name": "ชื่อคุณลักษณะ" }`
- `GET /api/participants?search=...&trait=...` ค้นหา/กรองข้อมูล
- `POST /api/participants` เพิ่มข้อมูล (multipart/form-data)
  - `name` (required)
  - `image` (optional file)
  - `profileLink` (optional)
  - `rpPostLink` (optional)
  - `deleteCode` (required, 4-40 chars)
  - `traits` (optional JSON array string)
- `DELETE /api/participants/:id` ลบโพสต์
  - body JSON: `{ "deleteCode": "รหัสลบโพสต์" }`
