'use client'

import { useEffect, useRef, useState } from 'react'
import { useSiteBranding } from '@readji/shared/src/site-branding'
import { ImagePlus, LoaderCircle, Plus, Save, Trash2, UploadCloud, X } from 'lucide-react'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

type Package = { amount: string; bonus: string }
interface Config {
  site: { name: string; tagline: string; description: string; site_url: string; coin_name: string; logo_key?: string; favicon_key?: string }
  logo_url: string | null
  favicon_url: string | null
  topup: { packages: Package[] }
  withdrawal: { commission_percent: string }
  features: Record<'registration' | 'writer_application' | 'comments' | 'topup' | 'withdrawals', boolean>
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const featureLabels: Record<keyof Config['features'], string> = {
  registration: 'เปิดให้สมัครสมาชิก',
  writer_application: 'เปิดรับสมัครนักเขียน',
  comments: 'เปิดระบบความคิดเห็น',
  topup: 'เปิดระบบเติมเงิน',
  withdrawals: 'เปิดระบบถอนเงิน',
}

function BrandingImageDropzone({ kind, file, savedUrl, saving, onChange }: {
  kind: 'logo' | 'favicon'
  file: File | null
  savedUrl: string | null
  saving: boolean
  onChange: (file: File | null) => void
}) {
  const label = kind === 'logo' ? 'Logo' : 'Favicon'
  const id = `site-${kind}`
  const fileInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function selectFile(selected: File | undefined) {
    if (!selected || saving) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      toast.error('กรุณาเลือกไฟล์ PNG, JPG หรือ WebP ขนาดไม่เกิน 5 MB')
      return
    }
    onChange(selected)
  }

  const imageUrl = preview || savedUrl
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`${id}-trigger`}>{kind === 'logo' ? 'Logo เว็บไซต์' : 'Favicon — ไอคอนบนแท็บเบราว์เซอร์'}</Label>
        {file && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">รอบันทึก</span>}
      </div>
      <div
        className="w-full min-w-0"
        onDragEnter={(event) => {
          event.preventDefault()
          if (saving || !event.dataTransfer.types.includes('Files')) return
          dragDepth.current += 1
          setIsDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = saving ? 'none' : 'copy'
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setIsDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          dragDepth.current = 0
          setIsDragging(false)
          if (saving) return
          if (event.dataTransfer.files.length !== 1) {
            toast.error(`กรุณาเลือก ${label} ครั้งละ 1 รูป`)
            return
          }
          selectFile(event.dataTransfer.files[0])
        }}
      >
        <Input ref={fileInput} id={id} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={`เลือกไฟล์ ${label}`} onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = '' }} />
        <Button
          id={`${id}-trigger`}
          type="button"
          variant="outline"
          disabled={saving}
          aria-label={`${imageUrl ? 'เปลี่ยนรูป' : 'เลือกไฟล์'} ${label}`}
          aria-describedby={`${id}-help`}
          aria-busy={saving}
          onClick={() => fileInput.current?.click()}
          className={`group h-auto min-h-56 w-full flex-col gap-5 whitespace-normal rounded-2xl border-2 border-dashed px-3 py-7 text-center shadow-none transition-colors sm:px-5 xl:flex-row xl:px-8 xl:text-left ${isDragging ? 'border-primary bg-primary/10 ring-4 ring-primary/10 hover:bg-primary/10' : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/5'}`}
        >
          <span className="pointer-events-none flex size-24 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-background p-4 shadow-sm sm:size-36">
            {imageUrl ? (
              <img src={imageUrl} alt={`ตัวอย่าง ${label}`} className="max-h-full max-w-full object-contain" draggable={false} />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105"><ImagePlus className="size-8" /></span>
            )}
          </span>
          <span className="pointer-events-none flex min-w-0 flex-1 flex-col items-center gap-2 xl:items-start">
            <span className="text-base font-semibold">{saving ? 'กำลังบันทึก...' : isDragging ? `วางรูปเพื่อเลือก ${label}` : `ลากรูป ${label} มาวางที่นี่`}</span>
            <span className="text-sm font-normal text-muted-foreground">หรือคลิกเพื่อ{imageUrl ? 'เปลี่ยนรูปจากเครื่อง' : 'เลือกไฟล์จากเครื่อง'}</span>
            <span className="mt-1 inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm shadow-sm">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4 text-primary" />}
              {saving ? 'กำลังบันทึก' : imageUrl ? `เปลี่ยนรูป ${label}` : 'เลือกไฟล์รูปภาพ'}
            </span>
            <span className="mt-1 text-xs font-normal text-muted-foreground">PNG, JPG หรือ WebP · ไม่เกิน 5 MB</span>
          </span>
        </Button>
        {file && (
          <div className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2.5" aria-live="polite">
            <ImagePlus className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
              <p className="text-xs text-muted-foreground">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(2)} MB`}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`ยกเลิกรูป ${label} ที่เลือก`} title="ยกเลิกรูปที่เลือก" onClick={() => onChange(null)}><X className="size-4" /></Button>
          </div>
        )}
        {kind === 'favicon' && imageUrl && (
          <div className="mt-3 rounded-xl border bg-muted/30 px-4 pt-3">
            <p className="mb-2 text-xs text-muted-foreground">ตัวอย่างบนแท็บเบราว์เซอร์</p>
            <div className="flex w-56 max-w-full items-center gap-2 rounded-t-lg border border-b-0 bg-background px-3 py-2 text-xs">
              <img src={imageUrl} alt="" className="size-4 shrink-0 object-contain" />
              <span className="min-w-0 flex-1 truncate">หน้าแรก | เว็บไซต์</span>
              <X className="size-3 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
      <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">
        {kind === 'favicon' ? 'แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นหลังโปร่งใส ระบบจะปรับเป็น PNG ขนาด 48 × 48 พิกเซลสำหรับแท็บเบราว์เซอร์' : 'ใช้ภาพนิ่ง แนะนำพื้นหลังโปร่งใส'}
        {' '}รูปใหม่จะใช้งานเมื่อกด “บันทึกทั้งหมด”
      </p>
    </div>
  )
}

export default function SiteSettingsPage() {
  const { accessToken } = useAdminAuth()
  const { updateBranding } = useSiteBranding()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [faviconFile, setFaviconFile] = useState<File | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    void fetch(`${apiUrl}/admin/site`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('ไม่สามารถโหลดการตั้งค่าเว็บไซต์ได้')
        setConfig((await response.json()) as Config)
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'))
      .finally(() => setLoading(false))
  }, [accessToken])

  const updateSite = (key: keyof Config['site'], value: string) =>
    setConfig((current) => current && { ...current, site: { ...current.site, [key]: value } })
  const updateFeature = (key: keyof Config['features'], value: boolean) =>
    setConfig((current) => current && { ...current, features: { ...current.features, [key]: value } })
  const updatePackage = (index: number, key: keyof Package, value: string) =>
    setConfig(
      (current) =>
        current && {
          ...current,
          topup: {
            packages: current.topup.packages.map((item, itemIndex) =>
              itemIndex === index ? { ...item, [key]: value } : item,
            ),
          },
        },
    )

  async function save() {
    if (!accessToken || !config || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const { site, topup, withdrawal, features } = config
      const payload = { site: { ...site }, topup, withdrawal, features }
      for (const [kind, file] of [['logo', logoFile], ['favicon', faviconFile]] as const) {
        if (!file) continue
        const label = kind === 'logo' ? 'Logo' : 'Favicon'
        const form = new FormData()
        form.append(kind, file)
        const upload = await fetch(`${apiUrl}/admin/site/${kind}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
          body: form,
        })
        if (!upload.ok) {
          const error = await upload.json().catch(() => null)
          throw new Error(upload.status === 400 && typeof error?.message === 'string'
            ? error.message : `ไม่สามารถอัปโหลด ${label} ได้ กรุณาใช้ภาพนิ่ง PNG, JPG หรือ WebP ขนาดไม่เกิน 5 MB`)
        }
        const key = kind === 'logo' ? 'logo_key' : 'favicon_key'
        const uploaded = await upload.json() as Record<typeof key, string>
        payload.site[key] = uploaded[key]
      }
      const response = await fetch(`${apiUrl}/admin/site`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('ไม่สามารถบันทึกการตั้งค่าเว็บไซต์ได้')
      const saved = await response.json() as Config
      setConfig(saved)
      updateBranding({ logo_url: saved.logo_url, favicon_url: saved.favicon_url })
      setLogoFile(null)
      setFaviconFile(null)
      toast.success('บันทึกการตั้งค่าเรียบร้อยแล้ว')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ไม่สามารถบันทึกการตั้งค่าได้')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="w-full max-w-none space-y-6 p-6" aria-busy="true">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-96 max-w-[70vw]" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardHeader><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-72" /></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 5 }, (_, index) => <div className="space-y-2" key={index}><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>)}
            <div className="space-y-2 md:col-span-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-24 w-full" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-6 w-52" /><Skeleton className="h-4 w-80" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3" key={index}><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="size-10" /></div>)}
            <Skeleton className="h-10 w-36" />
          </CardContent>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><Skeleton className="h-6 w-36" /><Skeleton className="h-4 w-80" /></CardHeader><CardContent><Skeleton className="h-10 w-56" /></CardContent></Card>
          <Card><CardHeader><Skeleton className="h-6 w-44" /></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-40" /></CardContent></Card>
        </div>
      </main>
    )
  }
  if (!config) return <main className="w-full max-w-none p-6"><p className="rounded-md border p-4">{message ?? 'ไม่สามารถโหลดการตั้งค่าเว็บไซต์ได้'}</p></main>
  return (
    <main className="w-full max-w-none space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">ตั้งค่าเว็บไซต์</h1>
          <p className="text-muted-foreground">กำหนดข้อมูลหลัก ระบบเติมเงิน ค่าคอมมิชชัน และฟีเจอร์</p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          <Save className="mr-2 size-4" />
          {saving ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
        </Button>
      </div>
      {message && <p className="rounded-md border p-3 text-sm">{message}</p>}
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลเว็บไซต์</CardTitle>
          <CardDescription>ข้อมูลที่ใช้แสดงบนเว็บไซต์และลิงก์ระบบ</CardDescription>
        </CardHeader>
          <CardContent>
          <fieldset disabled={saving} className="grid min-w-0 gap-4 md:grid-cols-3">
          <div className="grid min-w-0 grid-cols-2 items-start gap-3 sm:gap-6 md:col-span-3">
            <BrandingImageDropzone kind="logo" file={logoFile} savedUrl={config.logo_url} saving={saving} onChange={setLogoFile} />
            <BrandingImageDropzone kind="favicon" file={faviconFile} savedUrl={config.favicon_url} saving={saving} onChange={setFaviconFile} />
          </div>
          {(
            [
              ['name', 'ชื่อเว็บไซต์'],
              ['tagline', 'คำโปรย'],
              ['site_url', 'URL เว็บไซต์'],
              ['coin_name', 'ชื่อเหรียญ'],
            ] as const
          ).map(([key, label]) => (
            <div className="space-y-2" key={key}>
              <Label>{label}</Label>
              <Input value={config.site[key]} onChange={(event) => updateSite(key, event.target.value)} />
            </div>
          ))}
          <div className="space-y-2 md:col-span-2">
            <Label>คำอธิบายเว็บไซต์</Label>
            <Textarea
              value={config.site.description}
              onChange={(event) => updateSite('description', event.target.value)}
            />
          </div>
          </fieldset>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>แพ็กเกจเติมเงินและโบนัส</CardTitle>
          <CardDescription>จำนวนเงินที่ผู้ใช้เลือกเติม พร้อมโบนัสเหรียญเพิ่มเติม</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.topup.packages.map((item, index) => (
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3" key={`${index}-${item.amount}`}>
              <div className="space-y-2">
                <Label>จำนวนเงิน</Label>
                <Input
                  inputMode="decimal"
                  value={item.amount}
                  onChange={(event) => updatePackage(index, 'amount', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>โบนัส</Label>
                <Input
                  inputMode="decimal"
                  value={item.bonus}
                  onChange={(event) => updatePackage(index, 'bonus', event.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setConfig({
                    ...config,
                    topup: { packages: config.topup.packages.filter((_, itemIndex) => itemIndex !== index) },
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setConfig({ ...config, topup: { packages: [...config.topup.packages, { amount: '', bonus: '0' }] } })
            }
          >
            <Plus className="mr-2 size-4" />
            เพิ่มแพ็กเกจ
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>การถอนเงิน</CardTitle>
          <CardDescription>คอมมิชชันจะถูกนำไปใช้เมื่อมีการถอนเงินเท่านั้น</CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm space-y-2">
          <Label>คอมมิชชัน (%)</Label>
          <Input
            inputMode="decimal"
            value={config.withdrawal.commission_percent}
            onChange={(event) => setConfig({ ...config, withdrawal: { commission_percent: event.target.value } })}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>เปิด–ปิดฟีเจอร์</CardTitle>
        </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
          {(Object.keys(featureLabels) as (keyof Config['features'])[]).map((key) => (
            <label className="flex items-center gap-3" key={key}>
              <Checkbox
                checked={config.features[key]}
                onCheckedChange={(checked) => updateFeature(key, checked === true)}
              />
              <span>{featureLabels[key]}</span>
            </label>
          ))}
        </CardContent>
      </Card>
    </main>
  )
}
