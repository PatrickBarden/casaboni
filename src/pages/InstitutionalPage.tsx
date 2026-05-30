import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import Footer from "../components/Footer";

type InstitutionalPageProps = {
  title: string;
  updatedAt: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
  }>;
};

export default function InstitutionalPage({ title, updatedAt, sections }: InstitutionalPageProps) {
  return (
    <div className="min-h-screen bg-surface-low text-primary">
      <header className="bg-primary text-white border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-6 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center">
            <BrandLogo light compact />
          </Link>
          <Link
            to="/"
            className="text-xs uppercase tracking-[0.2em] text-zinc-300 hover:text-white transition-colors"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight uppercase">{title}</h1>
        <p className="mt-3 text-sm text-outline uppercase tracking-wider">Atualizado em {updatedAt}</p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.heading} className="bg-white border border-outline-variant p-6 md:p-8">
              <h2 className="text-lg md:text-xl font-bold uppercase tracking-wide mb-4">
                {section.heading}
              </h2>
              <div className="space-y-4 text-sm md:text-base text-primary/90 leading-7">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}

