import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { forgotPassword } from "@/services/api";
import { Button, Input, Alert } from "@/components/ui";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">BetTracker</h1>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Mot de passe oublie</h2>
          <p className="text-sm text-slate-500 mb-4">Entrez votre email pour recevoir un lien de reinitialisation.</p>

          {sent ? (
            <Alert variant="success">
              <p className="font-medium mb-1">Email envoye</p>
              <p>Si un compte existe avec cet email, vous recevrez un lien de reinitialisation.</p>
            </Alert>
          ) : (
            <>
              {error && <Alert variant="error" className="mb-4">{error}</Alert>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@example.com"
                />
                <Button
                  type="submit"
                  loading={loading}
                  icon={<Mail size={16} />}
                  className="w-full"
                >
                  Envoyer le lien
                </Button>
              </form>
            </>
          )}

          <p className="mt-4 text-center text-sm text-slate-500">
            <Link to="/login" className="text-blue-600 hover:underline font-medium">Retour a la connexion</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
