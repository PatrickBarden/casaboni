import React, { useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Home, Building2, Building, MoreHorizontal, ArrowRight } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function QuizForm() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    environment: "",
    area: 150,
    name: "",
    phone: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const path = "leads";
    try {
      await addDoc(collection(db, path), {
        name: formData.name,
        phone: formData.phone,
        city: "Não informado",
        product: "Interesse Geral",
        environment: formData.environment,
        area: `${formData.area}m2`,
        date: new Date().toISOString().split("T")[0],
        status: "Novo",
        createdAt: serverTimestamp(),
      });
      navigate("/success");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-14 md:py-24 bg-primary relative" id="contato">
      <div className="absolute inset-0 opacity-10">
        <img
          className="w-full h-full object-cover"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAIBZqRMh2qsRGOWJcKbjRqLh71qoM-qkQcW1wHgP90a3a9v_wNcCUKT1AQWLih1hovSweSf5GlYzzhbanv19xOMcgbGWNXJBDxCLnDdw_ptIr5iwd6eoNE6kmtK3AnNmWkpDzeTrjdfvqJyxu49Mc8SKGfRltcnRYam9uyz_I2iyZM-7gEh0z-FohgSl0V5XVznYL_AlmiZ1QTN4Fd0RsaMlRrgQKB9tQiErl0-xVEShf5z_3MWpItWdcNk-2XS5cka0Oaf6o8Ng"
          alt="Architectural patterns"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="max-w-4xl mx-auto px-5 md:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-surface p-6 md:p-12 shadow-ambient"
        >
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-primary uppercase tracking-tighter mb-2">
              Solicite seu Orçamento Consultivo
            </h2>
            <p className="text-outline font-light">Personalize seu projeto em 3 passos simples</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 md:space-y-12">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-action mb-4 md:mb-6">
                1. Tipo de Ambiente
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[
                  { id: "residencial", label: "Residencial", icon: Home },
                  { id: "comercial", label: "Comercial", icon: Building2 },
                  { id: "corporativo", label: "Corporativo", icon: Building },
                  { id: "outro", label: "Outro", icon: MoreHorizontal },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, environment: item.label })}
                    className={`border p-3 md:p-4 text-center transition-all flex flex-col items-center gap-2 ${
                      formData.environment === item.label
                        ? "bg-action text-white border-action"
                        : "border-outline-variant hover:border-action hover:text-action"
                    }`}
                  >
                    <item.icon className="w-6 h-6" />
                    <span className="text-xs font-bold uppercase">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-action mb-4 md:mb-6">
                2. Metragem Aproximada
              </label>
              <div className="relative pt-2">
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: parseInt(e.target.value, 10) })}
                  className="w-full h-1 bg-surface-high appearance-none cursor-pointer accent-action"
                />
                <div className="flex justify-between mt-4 text-[10px] font-bold uppercase text-outline">
                  <span>10m²</span>
                  <span className="text-action text-sm">{formData.area}m²</span>
                  <span>500m²+</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
              <div className="relative">
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome Completo"
                  className="w-full bg-transparent border-b border-outline-variant py-3 focus:outline-none focus:border-action placeholder:text-outline/50 placeholder:uppercase placeholder:text-xs text-sm"
                />
              </div>
              <div className="relative">
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="WhatsApp / Telefone"
                  className="w-full bg-transparent border-b border-outline-variant py-3 focus:outline-none focus:border-action placeholder:text-outline/50 placeholder:uppercase placeholder:text-xs text-sm"
                />
              </div>
            </div>

            <div className="pt-3 md:pt-6">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 md:py-5 bg-primary text-white font-bold tracking-[0.18em] uppercase text-xs md:text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-4 disabled:opacity-60"
              >
                {isSubmitting ? "Enviando..." : "Enviar Solicitação"} <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
