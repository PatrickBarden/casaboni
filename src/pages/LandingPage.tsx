import Hero from "../components/Hero";
import ProductSection from "../components/ProductSection";
import QuizForm from "../components/QuizForm";
import Benefits from "../components/Benefits";
import Footer from "../components/Footer";
import ChatAgent from "../components/ChatAgent";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Hero />
      <ProductSection />
      <QuizForm />
      <Benefits />
      <Footer />
      <ChatAgent />
    </div>
  );
}
