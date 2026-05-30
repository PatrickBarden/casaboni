import InstitutionalPage from "./InstitutionalPage";

export default function SustainabilityPage() {
  return (
    <InstitutionalPage
      title="Sustentabilidade"
      updatedAt="30 de maio de 2026"
      sections={[
        {
          heading: "Compromisso Casaboni",
          paragraphs: [
            "A Casaboni prioriza soluções duráveis e de alto desempenho para reduzir desperdício em obras residenciais e corporativas.",
            "Trabalhamos com parceiros e linhas de acabamento que valorizam eficiência de uso e vida útil prolongada.",
          ],
        },
        {
          heading: "Boas Práticas",
          paragraphs: [
            "Orientamos nossos clientes para especificação correta de materiais, minimizando retrabalho e descarte.",
            "Incentivamos práticas de instalação planejada e manutenção preventiva para preservar os produtos por mais tempo.",
          ],
        },
        {
          heading: "Evolução Contínua",
          paragraphs: [
            "Nosso processo comercial e técnico é revisado continuamente para incorporar novas soluções e fornecedores responsáveis.",
            "Acreditamos que sustentabilidade e sofisticação podem caminhar juntas na transformação dos ambientes.",
          ],
        },
      ]}
    />
  );
}

