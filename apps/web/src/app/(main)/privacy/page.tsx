import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SITE_CONFIG } from '@/site.config'

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว',
  description: 'การเก็บ ใช้ และดูแลข้อมูลส่วนบุคคลของผู้ใช้งาน Dopapage รวมถึงการเข้าสู่ระบบด้วย Google',
  alternates: { canonical: '/privacy' },
}

const supportEmail = 'pagedopa@gmail.com'

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6">
        <Link href="/">
          <ArrowLeft className="size-4" />
          กลับหน้าแรก
        </Link>
      </Button>

      <header className="mb-8 space-y-3">
        <Badge variant="secondary">
          <ShieldCheck className="size-3.5" />
          {SITE_CONFIG.name}
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">นโยบายความเป็นส่วนตัว</h1>
        <p className="text-sm text-muted-foreground">อัปเดตล่าสุด 24 ตุลาคม 2569</p>
        <p className="text-sm leading-7">
          นโยบายนี้อธิบายการใช้ข้อมูลของเว็บไซต์ dopapage.com และบริการบัญชีของ {SITE_CONFIG.name}
          เพื่อให้คุณทราบว่าระบบรับข้อมูลใด ใช้เพื่ออะไร และติดต่อเกี่ยวกับข้อมูลของคุณได้อย่างไร
        </p>
      </header>

      <div className="space-y-8 text-sm leading-7 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        <section aria-labelledby="collected-data">
          <h2 id="collected-data">1. ข้อมูลที่ระบบรับและจัดเก็บ</h2>
          <ul>
            <li>ข้อมูลบัญชีที่คุณให้ เช่น อีเมล ชื่อผู้ใช้ ชื่อที่แสดง รูปโปรไฟล์ และหมายเลขโทรศัพท์เมื่อใช้การยืนยันด้วย OTP</li>
            <li>เมื่อเข้าสู่ระบบหรือเชื่อมบัญชี Google ระบบรับรหัสระบุบัญชี Google อีเมลที่ยืนยันแล้ว ชื่อ และรูปโปรไฟล์จาก Google</li>
            <li>ข้อมูลที่เกิดจากการใช้บริการ เช่น การตั้งค่าการอ่าน รายการโปรด ความคิดเห็น ผลงานที่เผยแพร่ ยอดคงเหลือ รายการซื้อ และข้อมูลการเติมเงิน</li>
            <li>เมื่อใช้บริการสำหรับนักเขียน ระบบอาจรับข้อมูลบัญชีรับเงินและรายการถอนเงินที่คุณส่งให้ รวมถึงไฟล์หรือหลักฐานที่คุณอัปโหลด</li>
            <li>ข้อมูลเซสชัน คุกกี้ และบันทึกเหตุการณ์ของระบบที่ใช้ดูแลการเข้าสู่ระบบ การทำงาน และความปลอดภัยของบริการ</li>
          </ul>
        </section>

        <section aria-labelledby="data-use">
          <h2 id="data-use">2. วัตถุประสงค์ในการใช้ข้อมูล</h2>
          <p>
            เราใช้ข้อมูลเพื่อสร้างและดูแลบัญชี ยืนยันตัวตน ให้บริการอ่านและเผยแพร่ผลงาน
            บันทึกรายการซื้อและการรับเงิน ส่งข้อความเกี่ยวกับบัญชีหรือรหัส OTP
            แสดงข้อมูลโปรไฟล์ตามการใช้งาน และตรวจสอบปัญหาหรือการใช้งานที่อาจกระทบความปลอดภัยของระบบ
          </p>
        </section>

        <section aria-labelledby="google-data">
          <h2 id="google-data">3. การเข้าสู่ระบบด้วย Google</h2>
          <p>
            {SITE_CONFIG.name} ขอสิทธิ์เฉพาะ openid, email และ profile เพื่อยืนยันบัญชี
            สร้างบัญชีเมื่อเปิดรับสมาชิก หรือเชื่อม Google กับบัญชีเดิมตามที่คุณร้องขอ
            ระบบไม่ขอรหัสผ่าน Google และไม่ขอสิทธิ์อ่าน Gmail, Google Drive หรือรายชื่อติดต่อ
          </p>
          <p className="mt-3">
            ข้อมูลบัญชี Google ใช้สำหรับการให้บริการบัญชีและการแสดงโปรไฟล์ของคุณ
            เราไม่นำข้อมูลนี้ไปขายหรือใช้เพื่อโฆษณา คุณจัดการการเชื่อมบัญชีได้ที่หน้าโปรไฟล์ &gt; ความปลอดภัย
            และถอนสิทธิ์ของแอปได้จาก{' '}
            <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              การเชื่อมต่อกับบุคคลที่สามในบัญชี Google
            </a>
            {' '}การถอนสิทธิ์ที่ Google ไม่ได้ลบข้อมูลบัญชีที่จัดเก็บใน {SITE_CONFIG.name} โดยอัตโนมัติ
          </p>
        </section>

        <section aria-labelledby="providers">
          <h2 id="providers">4. ผู้ให้บริการที่เกี่ยวข้อง</h2>
          <p>
            บริการบางส่วนอาศัยผู้ให้บริการภายนอก ได้แก่ Google สำหรับการยืนยันตัวตน
            Cloudflare สำหรับการให้บริการเว็บไซต์และ Turnstile, Resend สำหรับอีเมล,
            BoostSMS สำหรับ OTP และผู้ให้บริการรับชำระเงินเมื่อคุณใช้ฟังก์ชันนั้น
            ผู้ให้บริการเหล่านี้อาจได้รับข้อมูลที่จำเป็นต่อการทำงานของบริการนั้น
            และประมวลผลข้อมูลตามนโยบายของตน ข้อมูลบัญชี ฐานข้อมูล และไฟล์อัปโหลดของเว็บไซต์จัดเก็บบนเซิร์ฟเวอร์ที่ใช้ให้บริการ {SITE_CONFIG.name}
          </p>
        </section>

        <section aria-labelledby="cookies">
          <h2 id="cookies">5. คุกกี้และการดูแลข้อมูล</h2>
          <p>
            เว็บไซต์ใช้คุกกี้เพื่อจดจำเซสชันและตรวจสอบคำขอเข้าสู่ระบบ รวมถึงการทำงานของบริการป้องกันการใช้งานอัตโนมัติ
            การปิดกั้นคุกกี้หรือสคริปต์ที่จำเป็นอาจทำให้เข้าสู่ระบบไม่ได้
            การเชื่อมต่อเว็บไซต์ใช้ HTTPS และการเข้าถึงข้อมูลในระบบจำกัดตามสิทธิ์ของผู้ใช้งาน
          </p>
        </section>

        <section aria-labelledby="retention">
          <h2 id="retention">6. การเก็บรักษาและคำขอเกี่ยวกับข้อมูล</h2>
          <p>
            ระบบยังไม่มีการลบข้อมูลบัญชีโดยอัตโนมัติเมื่อไม่ได้ใช้งาน
            หากต้องการเข้าถึง แก้ไข หรือลบข้อมูลบัญชี โปรดติดต่อผู้ดูแลผ่านอีเมลด้านล่าง
            เราอาจขอข้อมูลเพื่อยืนยันว่าคุณเป็นเจ้าของบัญชีก่อนดำเนินการ
            และจะตรวจสอบข้อมูลที่เกี่ยวข้องกับรายการซื้อ การรับเงิน หรือภาระที่ยังคงค้างประกอบการจัดการคำขอ
          </p>
        </section>

        <section aria-labelledby="privacy-contact">
          <h2 id="privacy-contact">7. ติดต่อเกี่ยวกับความเป็นส่วนตัว</h2>
          <p>
            ติดต่อผู้ดูแล {SITE_CONFIG.name} ที่{' '}
            <a href={`mailto:${supportEmail}`} className="text-primary underline underline-offset-4">{supportEmail}</a>
            {' '}โดยระบุอีเมลหรือชื่อผู้ใช้ที่เกี่ยวข้องและคำขอของคุณ กรุณาอย่าส่งรหัสผ่านหรือรหัส OTP มาในอีเมล
          </p>
          <p className="mt-3">เมื่อมีการปรับปรุงนโยบาย เราจะแสดงฉบับปัจจุบันและวันที่อัปเดตบนหน้านี้</p>
        </section>
      </div>
    </article>
  )
}
