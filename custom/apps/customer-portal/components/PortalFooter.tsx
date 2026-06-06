import { Separator } from '@core/components/ui/separator'

const FOOTER_LINKS = [
  { label: 'Privacy Policy', href: '#' },
  { label: 'Terms of Service', href: '#' },
  { label: 'Support', href: '#' },
]

export function PortalFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="flex items-center justify-between px-6 h-12">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Customer Portal
        </p>
        <nav className="flex items-center gap-1">
          {FOOTER_LINKS.map((link, i) => (
            <span key={link.label} className="flex items-center gap-1">
              {i > 0 && <Separator orientation="vertical" className="h-3" />}
              <a
                href={link.href}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
              >
                {link.label}
              </a>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  )
}
