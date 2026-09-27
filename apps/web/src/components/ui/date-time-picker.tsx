'use client'

import { useMemo } from 'react'
import { CalendarIcon } from 'lucide-react'
import { th } from 'react-day-picker/locale'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function DateTimePicker({ id, value, onChange, disabled, label = 'เลือกวันและเวลา', minDateTime }: {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label?: string
  minDateTime?: Date
}) {
  const minimum = useMemo(() => {
    if (!minDateTime || !Number.isFinite(minDateTime.getTime())) return undefined
    const next = new Date(minDateTime)
    if (next.getSeconds() || next.getMilliseconds()) {
      next.setSeconds(0, 0)
      next.setMinutes(next.getMinutes() + 1)
    }
    return next
  }, [minDateTime])
  const minimumDay = useMemo(() => {
    if (!minimum) return undefined
    return new Date(minimum.getFullYear(), minimum.getMonth(), minimum.getDate())
  }, [minimum])
  const selected = useMemo(() => {
    const parsed = value ? new Date(value) : undefined
    return parsed && Number.isFinite(parsed.getTime()) ? parsed : undefined
  }, [value])
  const hours = value.slice(11, 13) || '00'
  const minutes = value.slice(14, 16) || '00'

  function isBeforeMinimum(nextValue: string) {
    if (!minimum) return false
    const next = new Date(nextValue)
    return !Number.isFinite(next.getTime()) || next < minimum
  }

  function isMinimumDay(date: Date | undefined) {
    return Boolean(date && minimumDay && date.getFullYear() === minimumDay.getFullYear() && date.getMonth() === minimumDay.getMonth() && date.getDate() === minimumDay.getDate())
  }

  function selectDate(date: Date | undefined) {
    if (!date) return
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const nextValue = `${day}T${hours}:${minutes}`
    if (!isBeforeMinimum(nextValue)) {
      onChange(nextValue)
      return
    }
    const minimumHours = String(minimum!.getHours()).padStart(2, '0')
    const minimumMinutes = String(minimum!.getMinutes()).padStart(2, '0')
    onChange(`${day}T${minimumHours}:${minimumMinutes}`)
  }

  function selectTime(nextHours: string, nextMinutes: string) {
    const nextValue = `${value.slice(0, 10)}T${nextHours}:${nextMinutes}`
    if (!isBeforeMinimum(nextValue)) onChange(nextValue)
  }

  return <Popover>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" disabled={disabled} aria-label={label} className="h-9 w-full min-w-0 justify-start bg-background px-2 text-left text-xs font-normal shadow-none">
        <CalendarIcon className="size-4 shrink-0" />
        <span className="truncate">{selected ? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(selected) : 'เลือกวันและเวลา'}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
      <Calendar locale={th} mode="single" selected={selected} defaultMonth={selected} onSelect={selectDate} disabled={disabled || (minimumDay ? (date) => date < minimumDay : undefined)} />
      <div className="space-y-2 border-t p-3">
        <Label className="text-xs">เวลา</Label>
        <div className="flex items-center gap-2">
          <Select value={hours} disabled={disabled || !selected} onValueChange={(hour) => selectTime(hour, minutes)}>
            <SelectTrigger aria-label="ชั่วโมง" className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((hour) => <SelectItem key={hour} value={hour} disabled={isMinimumDay(selected) && Number(hour) < minimum!.getHours()}>{hour}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-muted-foreground">:</span>
          <Select value={minutes} disabled={disabled || !selected} onValueChange={(minute) => selectTime(hours, minute)}>
            <SelectTrigger aria-label="นาที" className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((minute) => <SelectItem key={minute} value={minute} disabled={isMinimumDay(selected) && Number(hours) === minimum!.getHours() && Number(minute) < minimum!.getMinutes()}>{minute}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {!selected && <p className="text-xs text-muted-foreground">เลือกวันที่ก่อนกำหนดเวลา</p>}
      </div>
    </PopoverContent>
  </Popover>
}
