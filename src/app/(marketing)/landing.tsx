import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * Public landing content.
 *
 * Rendered by the root route rather than owning one itself, so a signed-in
 * visitor is redirected to their working surface before any of this mounts.
 *
 * What this page is for: someone opens a link, has no idea what Livn is, and
 * needs to understand it and start looking around in under a minute. That means
 * showing the actual application rather than describing it, and stating plainly
 * what is finished and what is not.
 *
 * What it deliberately is not: no feature grid with invented benefits, no
 * testimonials, no numbers pulled out of the air, no "trusted by". Every claim
 * here is checkable by signing in.
 */

/** The five questions the product is built to answer, in the order it asks them. */
const LOOP = [
  {
    step: "Plan",
    question: "Apa yang ingin saya capai?",
    body: "Area hidup, tujuan yang bisa diukur, proyek yang punya akhir, dan tugas yang punya hari.",
  },
  {
    step: "Do",
    question: "Apa yang harus saya kerjakan hari ini?",
    body: "Satu layar yang menyatukan prioritas, kebiasaan dan saldo — tanpa membuka lima tempat berbeda.",
  },
  {
    step: "Record",
    question: "Apa yang sebenarnya terjadi?",
    body: "Catatan harian, peristiwa hidup, dan setiap pergerakan uang, masing-masing tersimpan apa adanya.",
  },
  {
    step: "Measure",
    question: "Seberapa jauh saya melangkah?",
    body: "Tingkat penyelesaian, konsistensi kebiasaan, dan arus uang — semuanya dihitung, tidak pernah diketik manual.",
  },
  {
    step: "Reflect",
    question: "Apa yang perlu saya ubah?",
    body: "Linimasa dan statistik yang menyusun ulang apa yang terjadi, supaya keputusan berikutnya lebih baik.",
  },
];

/** Rules that decided how everything else was built. */
const PRINCIPLES = [
  {
    title: "Tidak ada angka yang dikarang",
    body: "Setiap persentase, saldo dan grafik dihitung dari catatan yang benar-benar ada. Tidak ada data contoh yang disembunyikan sebagai data asli, tidak ada statistik dekoratif yang tidak bisa ditelusuri.",
  },
  {
    title: "Buku besar, bukan catatan tempelan",
    body: "Saldo akun selalu diturunkan dari transaksi, tidak pernah disimpan sebagai angka terpisah. Transfer antar akun sendiri tidak pernah dihitung sebagai pemasukan atau pengeluaran.",
  },
  {
    title: "Riwayat tidak ditimpa",
    body: "Transaksi yang salah dibatalkan dengan catatan pembalik, bukan dihapus. Kesalahan dan koreksinya sama-sama terlihat, supaya catatan lama tetap bisa dipercaya.",
  },
  {
    title: "Tidak perlu mengetik ulang",
    body: "Mengisi jurnal tidak perlu menyalin daftar tugas yang selesai. Halaman hari ini menyusunnya sendiri dari catatan yang sudah ada.",
  },
  {
    title: "Ukuran yang jujur",
    body: "Kebiasaan dinilai dari berapa kali benar-benar dilakukan, bukan dari beruntun tanpa putus. Satu hari terlewat tidak menghapus kerja tiga minggu.",
  },
  {
    title: "Tenang, bukan ramai",
    body: "Tanpa gradasi mencolok, tanpa kartu bertumpuk, tanpa gamifikasi. Alat yang dibuka setiap hari sebaiknya tidak berteriak.",
  },
];

/** Screens shown as proof, each with the one thing it demonstrates. */
const SCREENS = [
  {
    id: "today",
    src: "/showcase/today.png",
    title: "Today",
    lead: "Permukaan kerja harian.",
    body: "Prioritas hari ini, tugas yang terlewat, kebiasaan, saldo, dan ruang untuk menulis. Setiap angka di sini disusun dari catatan yang ada di tempat lain, bukan diisi ulang.",
    mobile: true,
  },
  {
    id: "plan",
    src: "/showcase/plan.png",
    title: "Plan",
    lead: "Arah sebelum kecepatan.",
    body: "Area, tujuan, proyek dan tugas dalam satu hierarki. Progres tujuan dihitung dari data yang terhubung, dan proyek menampilkan persentase dari milestone, bukan dari jumlah tugas.",
    mobile: false,
  },
  {
    id: "money",
    src: "/showcase/money.png",
    title: "Money",
    lead: "Buku besar, bukan kalkulator.",
    body: "Saldo diturunkan dari transaksi. Transfer tidak mengubah pemasukan atau pengeluaran. Transaksi yang salah dibatalkan dengan catatan pembalik sehingga riwayatnya tetap utuh.",
    mobile: false,
  },
  {
    id: "progress",
    src: "/showcase/progress.png",
    title: "Progress",
    lead: "Diukur, bukan ditebak.",
    body: "Rentang harian sampai tahunan, dengan perbandingan terhadap periode sebelumnya yang panjangnya disamakan agar tidak menyesatkan.",
    mobile: false,
  },
  {
    id: "journal",
    src: "/showcase/journal.png",
    title: "Journal",
    lead: "Catatan yang bisa dilihat lagi.",
    body: "Mood, energi dan fokus bersifat opsional — yang wajib hanya isinya. Refleksi mendalam tersedia kalau dibutuhkan, bukan dijejalkan di depan.",
    mobile: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      {/* ── Masthead ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-header border-b border-border bg-canvas/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Wordmark size="md" />
          <nav className="flex items-center gap-1.5">
            <a
              href="#screens"
              className="hidden rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink sm:inline-flex"
            >
              Lihat isinya
            </a>
            <a
              href="#status"
              className="hidden rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink sm:inline-flex"
            >
              Sejauh mana
            </a>
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-md border border-transparent bg-accent px-3.5 text-xs font-medium text-accent-ink transition-colors duration-fast hover:bg-accent-hover"
            >
              Masuk
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="pt-16 sm:pt-24">
          <div className="max-w-3xl">
            <p className="text-micro font-medium uppercase tracking-[0.14em] text-ink-faint">
              Personal Life OS
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
              Tempat hidup kamu dicatat, diukur, lalu diperbaiki.
            </h1>
            <p className="mt-5 max-w-[58ch] text-base leading-relaxed text-ink-muted sm:text-lg">
              Rencana, tugas, kebiasaan, jurnal, dan keuangan dalam satu sistem yang
              saling terhubung. Bukan dashboard untuk dipamerkan — alat kerja pribadi
              yang dipakai setiap hari.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-md border border-transparent bg-accent px-6 text-sm font-medium text-accent-ink transition-colors duration-fast hover:bg-accent-hover"
              >
                Coba lihat isinya
              </Link>
              <a
                href="#screens"
                className="inline-flex h-11 items-center rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-ink transition-colors duration-fast hover:bg-surface-sunken"
              >
                Lihat tangkapan layarnya
              </a>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
              Akun demo sudah terisi lima minggu riwayat — tugas, kebiasaan, transaksi,
              jurnal dan peristiwa hidup. Masuk dan klik-klik saja.
            </p>
          </div>

          {/* The product itself, immediately. A description of an application is
              far weaker evidence than the application. */}
          <figure className="mt-12 overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
            <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-sunken px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
              </span>
              <span className="ml-2 truncate text-micro text-ink-faint">
                Today — prioritas, kebiasaan, uang dan refleksi dalam satu layar
              </span>
            </div>
            <Image
              src="/showcase/today.png"
              alt="Halaman Today di Livn, menampilkan tugas yang terlewat, tugas hari ini, kebiasaan dan ringkasan saldo"
              width={2880}
              height={1800}
              priority
              className="w-full"
              sizes="(max-width: 1152px) 100vw, 1152px"
            />
          </figure>
        </section>

        {/* ── The loop ────────────────────────────────────────────────────── */}
        <section className="mt-24">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
            Satu lingkaran yang berulang
          </h2>
          <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            Aplikasi ini disusun mengikuti cara kerja yang sebenarnya, bukan daftar
            fitur. Setiap bagian menjawab satu pertanyaan, dan jawabannya menjadi
            masukan untuk bagian berikutnya.
          </p>

          <ol className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
            {LOOP.map((stage, index) => (
              <li key={stage.step} className="bg-surface px-5 py-5">
                <div className="flex items-baseline gap-2.5">
                  <span className="tabular text-micro text-ink-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold text-ink">{stage.step}</span>
                </div>
                <p className="mt-3 text-xs font-medium leading-relaxed text-ink">
                  {stage.question}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">{stage.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Screens ─────────────────────────────────────────────────────── */}
        <section id="screens" className="mt-24 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
            Isinya seperti apa
          </h2>
          <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            Tangkapan layar di bawah diambil dari aplikasi yang sedang berjalan,
            memakai akun demo yang datanya diisi sendiri. Tidak ada yang direkayasa
            untuk tampilan.
          </p>

          <div className="mt-10 space-y-14">
            {SCREENS.map((screen, index) => (
              <article
                key={screen.id}
                className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
              >
                {/* Text first on mobile, beside the image on desktop. The order
                    is set so the explanation is never below a tall screenshot on
                    a narrow screen. */}
                <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                  <figure className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                    <Image
                      src={screen.src}
                      alt={`Halaman ${screen.title} di Livn`}
                      width={2880}
                      height={1800}
                      className="w-full"
                      sizes="(max-width: 1024px) 100vw, 720px"
                    />
                  </figure>
                </div>

                <div className={index % 2 === 1 ? "lg:order-1" : undefined}>
                  <p className="text-micro font-medium uppercase tracking-[0.12em] text-ink-faint">
                    {String(index + 1).padStart(2, "0")} — {screen.title}
                  </p>
                  <h3 className="mt-2.5 text-lg font-semibold tracking-tight text-ink">
                    {screen.lead}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">{screen.body}</p>

                  {screen.mobile && (
                    <div className="mt-5 flex items-end gap-4">
                      <Image
                        src="/showcase/today-mobile.png"
                        alt="Halaman Today pada layar ponsel"
                        width={1170}
                        height={2532}
                        className="h-44 w-auto rounded-md border border-border shadow-subtle"
                      />
                      <p className="pb-1 text-micro leading-relaxed text-ink-faint">
                        Tata letak ponsel dirancang sendiri, bukan versi mengecil dari
                        tampilan desktop.
                      </p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Principles ──────────────────────────────────────────────────── */}
        <section className="mt-24">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
            Aturan yang dipegang
          </h2>
          <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            Hal-hal yang menentukan bagaimana sisanya dibangun. Ini yang membedakan
            alat kerja dari dashboard yang terlihat sibuk.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title} className="bg-surface px-5 py-5">
                <p className="text-sm font-medium text-ink">{principle.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  {principle.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Honest status ───────────────────────────────────────────────── */}
        <section id="status" className="mt-24 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
            Sejauh mana proyek ini
          </h2>
          <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            Ini masih dalam pengerjaan. Daftar di bawah bukan rencana pemasaran —
            bagian yang belum selesai memang belum bisa dipakai.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface px-5 py-5">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <span className="size-1.5 rounded-full bg-positive" aria-hidden />
                Sudah berjalan
              </p>
              <ul className="mt-3.5 space-y-2 text-xs leading-relaxed text-ink-muted">
                <li>Halaman Today sebagai permukaan kerja harian</li>
                <li>Area, tujuan, proyek, milestone dan tugas</li>
                <li>Kebiasaan dengan tingkat konsistensi dan rentetan</li>
                <li>Buku besar keuangan dengan saldo yang diturunkan</li>
                <li>Jurnal, peristiwa hidup, dan linimasa gabungan</li>
                <li>Statistik harian, mingguan, bulanan dan tahunan</li>
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-surface px-5 py-5">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <span className="size-1.5 rounded-full bg-border-strong" aria-hidden />
                Belum dikerjakan
              </p>
              <ul className="mt-3.5 space-y-2 text-xs leading-relaxed text-ink-muted">
                <li>Anggaran bulanan dan target tabungan</li>
                <li>Transaksi berulang dan proyeksi arus kas</li>
                <li>Review mingguan dan bulanan yang tersimpan</li>
                <li>Pencarian menyeluruh dan pengaturan akun</li>
                <li>Ekspor dan penghapusan data</li>
                <li>Peramalan dan deteksi kejanggalan</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-surface-sunken px-5 py-4">
            <p className="text-xs font-medium text-ink">Cara tahu ini benar-benar bekerja</p>
            <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-ink-muted">
              Perhitungan keuangan dan kebiasaan diuji terhadap ratusan pemeriksaan
              otomatis yang dijalankan langsung ke basis data — bukan ke data tiruan.
              Yang diperiksa termasuk: saldo setelah pemasukan, pengeluaran dan transfer;
              pemulihan saldo setelah transaksi dibatalkan; konsistensi kebiasaan
              mingguan yang tidak boleh dihitung seperti kebiasaan harian; dan bahwa satu
              pengguna tidak bisa membaca atau mengubah data pengguna lain.
            </p>
          </div>
        </section>

        {/* ── Closing action ─────────────────────────────────────────────── */}
        <section className="mt-24 rounded-xl border border-border bg-surface px-6 py-10 text-center sm:px-10">
          <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Ada akun demo yang sudah terisi.
          </h2>
          <p className="mx-auto mt-3 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
            Masuk dengan akun demo untuk melihat semua halaman dengan data sungguhan.
            Tidak ada yang perlu diisi, dan tidak ada yang bisa rusak.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-md border border-transparent bg-accent px-6 text-sm font-medium text-accent-ink transition-colors duration-fast hover:bg-accent-hover"
            >
              Masuk ke aplikasi
            </Link>
            <a
              href="#screens"
              className="inline-flex h-11 items-center rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-ink transition-colors duration-fast hover:bg-surface-sunken"
            >
              Lihat lagi tangkapan layarnya
            </a>
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="mt-20 border-t border-border-subtle py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Wordmark size="sm" />
              <span className="text-xs text-ink-faint">
                Dibangun dengan Next.js, TypeScript, Prisma dan PostgreSQL.
              </span>
            </div>
            <Link
              href="/login"
              className="text-xs font-medium text-accent underline-offset-4 hover:underline"
            >
              Masuk
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
