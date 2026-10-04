import Link from 'next/link'
import { SiteLogo } from '@readji/shared/src/site-branding'

export function AuthCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[600px] rounded-[2rem] border border-border/80 bg-card p-8 text-card-foreground shadow-2xl shadow-foreground/10 sm:p-10">
      <Link href="/" className="flex items-center justify-center">
        <SiteLogo className="h-32 w-40" fallback={<span
          role="img"
          aria-label="Dopapage"
          className="aspect-[1147/925] h-32 bg-primary [mask-image:url(/readji-logo-full.png)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:url(/readji-logo-full.png)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]"
        />} />
      </Link>
      <div className="my-7 border-t border-border/80" />
      <h1 className="mb-6 text-center text-lg font-bold tracking-[-0.02em] text-foreground">{heading}</h1>
      {children}
    </div>
  )
}
