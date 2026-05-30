import InstitutionalPage from "./InstitutionalPage";

export default function TermsPage() {
  return (
    <InstitutionalPage
      title="Termos de Uso"
      updatedAt="30 de maio de 2026"
      sections={[
        {
          heading: "Aceite e Finalidade",
          paragraphs: [
            "Ao utilizar este site, o visitante concorda com estes termos e com o uso da plataforma para consulta comercial e solicitação de atendimento.",
            "O conteúdo disponibilizado tem caráter informativo e comercial, sujeito a atualização sem aviso prévio.",
          ],
        },
        {
          heading: "Atendimento e Propostas",
          paragraphs: [
            "Recomendações de produtos e condições comerciais podem variar conforme estoque, região, prazo e análise técnica do projeto.",
            "Todo orçamento formal deve ser validado com a equipe comercial da Casaboni.",
          ],
        },
        {
          heading: "Responsabilidades",
          paragraphs: [
            "O usuário se compromete a fornecer informações verdadeiras para viabilizar atendimento adequado.",
            "A Casaboni não se responsabiliza por uso indevido de informações publicadas fora do contexto de orientação técnica.",
          ],
        },
      ]}
    />
  );
}

