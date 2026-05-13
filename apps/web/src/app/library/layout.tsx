import { LibraryChrome } from "./LibraryChrome";

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LibraryChrome>{children}</LibraryChrome>;
}
