import InstitutionalPage from "./InstitutionalPage";

export default function PrivacyPolicyPage() {
  return (
    <InstitutionalPage
      title="Políticas de Privacidade"
      updatedAt="30 de maio de 2026"
      sections={[
        {
          heading: "Coleta de Dados",
          paragraphs: [
            "A Casaboni coleta informações fornecidas voluntariamente no formulário e no atendimento consultivo, como nome, telefone, e-mail, ambiente e metragem.",
            "Também podemos registrar dados de interação para melhorar a experiência do cliente e acelerar o retorno comercial.",
          ],
        },
        {
          heading: "Uso das Informações",
          paragraphs: [
            "Os dados são utilizados para atendimento, recomendação de produtos, agendamento de reuniões e acompanhamento comercial.",
            "As informações não são vendidas e são tratadas com acesso restrito para operação interna.",
          ],
        },
        {
          heading: "Segurança e Direitos",
          paragraphs: [
            "Adotamos medidas técnicas e organizacionais para proteger os dados em nossos sistemas.",
            "O titular pode solicitar atualização ou exclusão de dados pelos canais oficiais da empresa.",
          ],
        },
      ]}
    />
  );
}

