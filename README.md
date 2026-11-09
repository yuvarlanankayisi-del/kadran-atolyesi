# Kadran Atölyesi

Xiaomi Watch S1 Active için saat yüzü tasarlayan Android uygulaması. Tasarlanan `.bin` dosyası Gadgetbridge ile saate yüklenir.

**İndir:** [Kadran-Atolyesi.apk (son sürüm)](../../releases/latest/download/Kadran-Atolyesi.apk)

- `app/src/main/assets/index.html` uygulamanın kendisidir (tek dosya).
- `kaynak/` içinde sayfanın düzenlenebilir kaynağı ve kadran dosyası derleyicisi (`wfbuild.js`) var.
- Her `main` gönderiminde GitHub Actions APK'yı derler ve yeni bir sürüm (Release) yayınlar. İmza sabit olduğu için yeni sürüm eskisinin üstüne kurulur.
