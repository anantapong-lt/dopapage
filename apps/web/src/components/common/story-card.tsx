'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Star, UserRound } from 'lucide-react'

export interface StoryCardProps {
  slug: string
  title: string
  image: string
  blurDataUrl?: string | null
  episode: string
  author: string
  meta: string
  ratingAverage: number
  type: 'novel' | 'manga'
  eager?: boolean
}

export function StoryCard({
  slug,
  title,
  image,
  blurDataUrl,
  episode,
  author,
  meta,
  ratingAverage,
  type,
  eager = false,
}: StoryCardProps) {
  const href = `/content/${encodeURIComponent(slug)}`

  return (
    <article className="min-w-0 lg:h-full">
      <Link
        href={href}
        className="group block min-w-0 cursor-pointer overflow-hidden rounded-md border border-border/80 bg-card text-card-foreground shadow-sm transition-[border-color,box-shadow] duration-300 hover:border-primary/40 hover:shadow-md lg:h-full"
        aria-label={`อ่าน ${title}`}
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-muted">
          <Image
            src={image}
            alt={`ปกเรื่อง ${title}`}
            fill
            placeholder={blurDataUrl ? 'blur' : 'empty'}
            blurDataURL={blurDataUrl ?? undefined}
            sizes="(min-width: 1536px) 147px, (min-width: 1280px) 125px, (min-width: 1024px) calc((100vw - 144px) / 6), (min-width: 768px) calc((100vw - 112px) / 4), calc((100vw - 48px) / 2.5)"
            quality={85}
            priority={eager}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
          <span className="absolute bottom-1 left-1 rounded-xs bg-primary px-1 py-0.5 text-[8px] font-semibold text-primary-foreground shadow-sm lg:px-1.5 lg:text-[10px]">
            {episode}
          </span>
        </div>

        <div className="p-3">
          <h3 className="truncate text-sm font-bold leading-5 text-card-foreground transition-colors duration-300 group-hover:text-primary">
            {title}
          </h3>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs leading-4 text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{author}</span>
          </p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] leading-[0.875rem] text-muted-foreground">{meta}</p>
            <span
              className="flex shrink-0 items-center gap-1 text-[11px] font-semibold leading-none text-muted-foreground"
              aria-label={`คะแนน ${ratingAverage.toFixed(1)} ดาว`}
            >
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="leading-none tabular-nums">
                {ratingAverage.toLocaleString('th-TH', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
