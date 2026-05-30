import InstitutionalPage from "./InstitutionalPage";

export default function InstallationPage() {
  return (
    <InstitutionalPage
      title="Instalação"
      updatedAt="30 de maio de 2026"
      sections={[
        {
          heading: "Planejamento Técnico",
          paragraphs: [
            "Antes da instalação, realizamos orientação sobre preparação da base, escolha da linha ideal e condições do ambiente.",
            "Esse cuidado aumenta a performance do produto e reduz riscos de retrabalho.",
          ],
        },
        {
          heading: "Boas Práticas de Execução",
          paragraphs: [
            "Recomendamos mão de obra qualificada e alinhada às especificações técnicas de cada categoria de acabamento.",
            "Também indicamos cuidados com nivelamento, recortes, dilatação e acabamento final para garantir resultado premium.",
          ],
        },
        {
          heading: "Pós-Instalação",
          paragraphs: [
            "Após a execução, orientamos sobre limpeza adequada, manutenção e rotina de conservação para preservar estética e durabilidade.",
            "Em caso de dúvidas, nossa equipe comercial e técnica permanece disponível para suporte.",
          ],
        },
      ]}
    />
  );
}

