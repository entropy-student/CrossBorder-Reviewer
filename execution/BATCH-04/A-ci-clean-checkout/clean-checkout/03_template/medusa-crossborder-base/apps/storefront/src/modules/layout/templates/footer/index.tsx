import LocalizedClientLink from "@modules/common/components/localized-client-link";

export default function Footer() {
  return (
    <footer className="ph-footer">
      <div className="ph-container">
        <div className="ph-footer-row">
          <LocalizedClientLink href="/" className="ph-footer-brand">Pawfectly Home</LocalizedClientLink>
          <div className="ph-footer-column">
            <span>Shop</span>
            <LocalizedClientLink href="/store">Shop all</LocalizedClientLink>
          </div>
        </div>
        <div className="ph-footer-rule" />
        <p className="ph-footer-legal">© {new Date().getFullYear()} Pawfectly Home</p>
      </div>
    </footer>
  )
}
