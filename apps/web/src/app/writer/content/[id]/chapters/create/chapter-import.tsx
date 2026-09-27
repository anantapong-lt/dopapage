'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EyeIcon, FileArchiveIcon, FileTextIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { FileUploadProgressDialog } from '@/components/common/file-upload-progress-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { importWriterChapters, importWriterMangaChapters } from '@/controllers/writer.controller'
import type { ImportedChapter } from '@/interface/writer-chapter-import.interface'
import type { ChapterStatus } from '@/interface/writer-chapter.interface'
import { chapterImportErrors, readChapterZip, readMangaChapterZip } from '@/utils/chapter-import.util'
import { SITE_CONFIG } from '@/site.config'

const statuses: { value: ChapterStatus; label: string }[] = [
  { value: 'published', label: 'เผยแพร่' },
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'scheduled', label: 'ตั้งเวลาเผยแพร่' },
  { value: 'hidden', label: 'ซ่อน' },
]

function formatPrice(value: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return value
  const [integer, decimal = ''] = value.split('.')
  return `${integer}.${decimal.padEnd(2, '0')}`
}

function StatusSelect({ value, onChange, label }: { value: string; onChange: (value: ChapterStatus) => void; label: string }) {
  return <Select value={value} onValueChange={(next) => onChange(next as ChapterStatus)}>
    <SelectTrigger aria-label={label} className="h-9 w-full min-w-0 bg-background shadow-none [&_[data-slot=select-value]]:truncate"><SelectValue placeholder="เลือก" /></SelectTrigger>
    <SelectContent>{statuses.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent>
  </Select>
}

export function ChapterImport({ contentId, isManga = false, onCancel, onBusyChange }: { contentId: string; isManga?: boolean; onCancel: () => void; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter()
  const { accessToken } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const dragDepthRef = useRef(0)
  const [rows, setRows] = useState<ImportedChapter[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [message, setMessage] = useState('')
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({})
  const [preview, setPreview] = useState<ImportedChapter | null>(null)
  const [price, setPrice] = useState('')
  const [status, setStatus] = useState<ChapterStatus | ''>('')
  const [date, setDate] = useState('')
  const errors = chapterImportErrors(rows, isManga)
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const hasErrors = rows.some((row) => errors[row.id].length > 0 || serverErrors[row.id]?.length)

  function change(id: string, patch: Partial<ImportedChapter>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
    setServerErrors((current) => ({ ...current, [id]: [] }))
  }

  function apply(patch: Partial<ImportedChapter>) {
    setRows((current) => current.map((row) => selected.has(row.id) ? { ...row, ...patch } : row))
    setServerErrors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !selected.has(id))))
  }

  function remove(ids: Set<string>) {
    setRows((current) => current.filter((row) => !ids.has(row.id)))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
  }

  async function load(file?: File) {
    if (!file || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    onBusyChange(true)
    setMessage('')
    try {
      setRows(await (isManga ? readMangaChapterZip(file) : readChapterZip(file)))
      setSelected(new Set())
      setServerErrors({})
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถอ่านไฟล์ ZIP ได้')
    } finally {
      setBusy(false)
      onBusyChange(false)
      busyRef.current = false
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit() {
    if (!accessToken || busyRef.current || !rows.length) return
    const currentErrors = chapterImportErrors(rows, isManga)
    if (rows.some((row) => currentErrors[row.id].length)) {
      setMessage('')
      return
    }
    busyRef.current = true
    setBusy(true)
    onBusyChange(true)
    setMessage('')
    try {
      const result = await (isManga
        ? importWriterMangaChapters(contentId, rows, accessToken)
        : importWriterChapters(contentId, rows, accessToken))
      if (result.errors.length) {
        const next: Record<string, string[]> = {}
        for (const error of result.errors) {
          const row = rows[error.index]
          if (row) next[row.id] = [...(next[row.id] ?? []), error.message]
        }
        setServerErrors(next)
        return
      }
      toast.success(`สร้าง ${result.created_count} ตอนเรียบร้อยแล้ว`)
      router.push(`/writer/content/${contentId}/chapters`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถสร้างตอนได้')
    } finally {
      setBusy(false)
      onBusyChange(false)
      busyRef.current = false
    }
  }

  return <div className="@container mt-6 min-w-0 space-y-4">
    <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-60">
      <Input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" aria-label="เลือกไฟล์ ZIP" onChange={(event) => void load(event.target.files?.[0])} />
      <div
        className={`relative rounded-xl border bg-card text-card-foreground transition-colors ${isDragging ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border'} ${rows.length ? 'flex flex-wrap items-center justify-between gap-3 p-4' : 'border-dashed px-5 py-8 text-center'}`}
        onDragEnter={(event) => {
          event.preventDefault()
          if (busyRef.current || !event.dataTransfer.types.includes('Files')) return
          dragDepthRef.current += 1
          setIsDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!busyRef.current && event.dataTransfer.types.includes('Files')) event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setIsDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepthRef.current = 0
          setIsDragging(false)
          void load(event.dataTransfer.files[0])
        }}
      >
        {isDragging && <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary bg-card/95 text-center backdrop-blur-sm">
          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UploadIcon className="size-5" />
          </span>
          <p className="text-sm font-semibold text-foreground">วางไฟล์ ZIP เพื่ออัปโหลด</p>
          <p className="mt-1 text-xs text-muted-foreground">ปล่อยไฟล์ลงในพื้นที่นี้ได้เลย</p>
        </div>}
        {rows.length ? <div>
          <h2 className="text-sm font-semibold">ตรวจสอบตอน <span className="ml-1 font-normal text-muted-foreground">{rows.length} รายการ</span></h2>
          <p className="mt-1 text-xs text-muted-foreground">แก้ไขในตาราง หรือเลือกหลายตอนเพื่อแก้ไขพร้อมกัน</p>
        </div> : <>
          <UploadIcon className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium">ลากไฟล์ ZIP มาวางที่นี่</p>
          <p className="mt-1 text-xs text-muted-foreground">สูงสุด 100MB · 500 ตอน · {isManga ? 'JPG, PNG หรือ WEBP' : 'TXT (UTF-8)'}</p>
        </>}
        <Button type="button" size="sm" variant="outline" className={rows.length ? 'shrink-0' : 'mt-4'} onClick={() => fileRef.current?.click()}>{rows.length ? 'เปลี่ยนไฟล์ ZIP' : 'เลือกไฟล์ ZIP'}</Button>
        {!rows.length && <div className="mt-5 space-y-1 text-xs text-muted-foreground">
          {isManga ? <div className="grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="font-semibold text-foreground">นำเข้า 1 ตอน</p>
              <p className="mt-2 whitespace-pre font-mono text-[11px] leading-5">{`ตอนที่ 23.zip\n├── 1.jpg\n└── 2.jpg`}</p>
              <p className="mt-2">ชื่อ ZIP จะเป็นชื่อตอน และเลข 23 จะเป็นเลขตอน</p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="font-semibold text-foreground">นำเข้าหลายตอน</p>
              <p className="mt-2 whitespace-pre font-mono text-[11px] leading-5">{`ไฟล์การ์ตูน.zip\n├── ตอนที่ 1/\n│   ├── 1.jpg\n│   └── 2.jpg\n└── ตอนที่ 2/\n    ├── 1.jpg\n    └── 2.jpg`}</p>
              <p className="mt-2">ชื่อโฟลเดอร์จะเป็นชื่อตอน และตัวเลขในชื่อโฟลเดอร์จะเป็นเลขตอน</p>
            </div>
          </div> : <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-border bg-background/70 text-left shadow-sm">
            <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileArchiveIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">novel.zip</p>
                <p className="text-[11px] text-muted-foreground">ตัวอย่างโครงสร้างไฟล์สำหรับนำเข้าหลายตอน</p>
              </div>
            </div>
            <div className="space-y-2 px-4 py-3 text-sm">
              {['ตอนที่ 1 ปราณวารี.txt', '2.txt', '3.txt'].map((fileName) => <div key={fileName} className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">├─</span>
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{fileName}</span>
              </div>)}
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="w-5 shrink-0 font-mono text-xs">└─</span>
                <span className="w-4 text-center">•••</span>
                <span>ไฟล์ตอนอื่น ๆ</span>
              </div>
            </div>
            <div className="grid gap-2 border-t border-border bg-muted/20 p-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-[11px] text-muted-foreground">ชื่อไฟล์จะถูกใช้เป็น</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">ชื่อตอน</p>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-[11px] text-muted-foreground">ตัวเลขในชื่อไฟล์จะถูกใช้เป็น</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">ตอนที่</p>
              </div>
            </div>
          </div>}
        </div>}
      </div>

      {rows.length > 0 && <>
        {selected.size > 0 && <div className="space-y-3 rounded-xl border border-border bg-card p-3 text-card-foreground sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">เลือก {selected.size} ตอน</p>
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(selected)}><Trash2Icon />ลบที่เลือก</Button>
          </div>
          <div className={`grid gap-3 [&>div]:min-w-0 ${status === 'scheduled' ? '@[55rem]:grid-cols-3' : '@[40rem]:grid-cols-2'}`}>
            <div className="space-y-2"><Label htmlFor="import-price" className="text-xs text-muted-foreground">ราคา ({SITE_CONFIG.coinName})</Label>
              <Input id="import-price" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} onBlur={() => setPrice(formatPrice(price))} />
            </div>
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">สถานะ</Label>
              <StatusSelect value={status} onChange={setStatus} label="สถานะแบบกลุ่ม" />
            </div>
            {status === 'scheduled' && <div className="space-y-2"><Label htmlFor="import-date" className="text-xs text-muted-foreground">ตั้งเวลาเผยแพร่</Label>
              <DateTimePicker id="import-date" value={date} onChange={setDate} disabled={busy} />
            </div>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {hasErrors && <p className="mr-auto text-xs text-destructive">แก้ไขหรือลบตอนที่ไฮไลต์ก่อนสร้าง</p>}
            <Button type="button" disabled={!selected.size || Boolean(price && (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) > 9_999_999_999.99)) || (status === 'scheduled' && !date)} onClick={() => apply({
              price: price ? formatPrice(price) : '',
              ...(status ? { status } : {}),
              ...(status === 'scheduled' ? { published_at: date } : {}),
            })}>บันทึก</Button>
          </div>
        </div>}
        <div className="min-w-0 rounded-xl border border-border bg-card text-card-foreground">
          <Label className="flex items-center gap-2 border-b p-4 text-xs @[70rem]:hidden">
            <Checkbox aria-label="เลือกทุกตอน" checked={allSelected ? true : selected.size ? 'indeterminate' : false} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))} />
            เลือกทุกตอน
          </Label>
          <Table className="block @[70rem]:table @[70rem]:table-fixed">
            <colgroup className="hidden @[70rem]:table-column-group">
              <col className="w-[4%]" /><col className="w-[8%]" /><col className="w-[24%]" /><col className="w-[10%]" />
              <col className="w-[15%]" /><col className="w-[19%]" /><col className="w-[15%]" /><col className="w-[5%]" />
            </colgroup>
            <TableHeader className="hidden bg-muted/30 @[70rem]:table-header-group [&_th]:whitespace-normal [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground"><TableRow>
              <TableHead><Checkbox aria-label="เลือกทุกตอน" checked={allSelected ? true : selected.size ? 'indeterminate' : false} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))} /></TableHead>
              {['ตอนที่', 'ชื่อตอน', 'ราคา', 'สถานะ', 'เวลาเผยแพร่', isManga ? 'รูปภาพ' : 'เนื้อหา', 'ลบ'].map((label) => <TableHead key={label}>{label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody className="block @[70rem]:table-row-group [&_td]:min-w-0 [&_td]:whitespace-normal [&_td]:py-2 [&_input]:h-9 [&_input]:min-w-0 [&_input]:bg-background [&_input]:shadow-none">{rows.map((row) => {
              const rowErrors = [...new Set([...errors[row.id], ...(serverErrors[row.id] ?? [])])]
              return <TableRow key={row.id} className={`grid grid-cols-2 gap-x-2 p-3 @[40rem]:grid-cols-4 @[70rem]:table-row @[70rem]:p-0 [&_td]:block @[70rem]:[&_td]:table-cell [&_td[data-label]]:before:mb-1.5 [&_td[data-label]]:before:block [&_td[data-label]]:before:text-xs [&_td[data-label]]:before:text-muted-foreground [&_td[data-label]]:before:content-[attr(data-label)] @[70rem]:[&_td[data-label]]:before:hidden ${rowErrors.length ? 'bg-destructive/10 hover:bg-destructive/15' : ''}`}>
                <TableCell><Checkbox aria-label={`เลือก ${row.title}`} checked={selected.has(row.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(row.id); else next.delete(row.id); return next })} /></TableCell>
                <TableCell data-label="ตอนที่"><Input aria-label={`เลขตอน ${row.filename}`} aria-invalid={rowErrors.length > 0} className="w-full" type="number" min="0" step="0.1" value={row.chapter_number} onChange={(event) => change(row.id, { chapter_number: event.target.value })} /></TableCell>
                <TableCell data-label="ชื่อตอน" className="col-span-2"><Input aria-label={`ชื่อตอน ${row.filename}`} value={row.title} maxLength={255} onChange={(event) => change(row.id, { title: event.target.value })} />
                  {rowErrors.length > 0 && <ul role="alert" className="mt-2 list-inside list-disc whitespace-normal text-xs text-destructive">{rowErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
                </TableCell>
                <TableCell data-label="ราคา"><Input aria-label={`ราคา ${row.title}`} className="w-full" type="number" min="0" step="0.01" value={row.price} onChange={(event) => change(row.id, { price: event.target.value })} onBlur={() => change(row.id, { price: formatPrice(row.price) })} /></TableCell>
                <TableCell data-label="สถานะ"><StatusSelect value={row.status} onChange={(value) => change(row.id, { status: value })} label={`สถานะ ${row.title}`} /></TableCell>
                <TableCell data-label="เวลาเผยแพร่">{row.status === 'scheduled' ? <DateTimePicker label={`เวลาเผยแพร่ ${row.title}`} value={row.published_at} onChange={(value) => change(row.id, { published_at: value })} disabled={busy} /> : <span className="text-xs text-muted-foreground">{row.status === 'published' ? 'ตอนนี้' : '—'}</span>}</TableCell>
                <TableCell data-label={isManga ? 'รูปภาพ' : 'เนื้อหา'}>{isManga ? <span className="text-xs text-muted-foreground">{(row.images?.length ?? 0).toLocaleString('th-TH')} รูป</span> : <Button type="button" variant="ghost" size="sm" className="h-auto max-w-full justify-start px-1 text-xs font-normal text-muted-foreground" onClick={() => setPreview(row)}><EyeIcon /><span className="min-w-0 whitespace-normal break-words">{row.content.length.toLocaleString('th-TH')} ตัวอักษร</span></Button>}</TableCell>
                <TableCell><Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`ลบ ${row.title}`} onClick={() => remove(new Set([row.id]))}><Trash2Icon /></Button></TableCell>
              </TableRow>
            })}</TableBody>
          </Table>
        </div>
      </>}
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
        {message && <p role="alert" className="mr-auto text-sm text-destructive">{message}</p>}
        <Button type="button" variant="ghost" onClick={onCancel}>ยกเลิก</Button>
        {rows.length > 0 && <Button type="button" disabled={hasErrors || !accessToken} onClick={() => void submit()}>สร้าง {rows.length} ตอน</Button>}
      </div>
    </fieldset>
    <FileUploadProgressDialog open={busy} />
    <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null) }}>
      <DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>ตัวอย่างเนื้อหาจาก {preview?.filename}</DialogDescription></DialogHeader>
        <div className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-7">{preview?.content || preview?.readError || 'ไม่มีเนื้อหา'}</div>
      </DialogContent>
    </Dialog>
  </div>
}
