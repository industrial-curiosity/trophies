import "./globals.css";
import Link from "next/link";
import WalletButton from "../components/WalletButton";

export const metadata = { title: "Verified Contribution Ledger" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Ledger</Link>
          <Link href="/company">Issue</Link>
          <Link href="/employee">Employee</Link>
          <Link href="/verify">Verify</Link>
          <span className="spacer" />
          <WalletButton />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
