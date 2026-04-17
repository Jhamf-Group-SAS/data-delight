import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Lock, User, ShieldCheck } from "lucide-react";

const Login = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Credenciales predefinidas
        const VALID_USER = "AdminRegency";
        const VALID_PASS = "Regis_Regen_123Mic";

        setTimeout(() => {
            if (username === VALID_USER && password === VALID_PASS) {
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("username", username);
                toast.success("Bienvenido al sistema");
                navigate("/dashboard");
            } else {
                toast.error("Credenciales incorrectas");
            }
            setLoading(false);
        }, 1000);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-3xl animate-pulse" />

            <div className="w-full max-w-md px-4 relative z-10">
                <div className="flex justify-center mb-8">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 shadow-xl backdrop-blur-sm">
                        <img
                            src="/r.png"
                            alt="Regency Logo"
                            className="h-16 w-16 object-contain"
                        />
                    </div>
                </div>

                <Card className="border-border/40 shadow-2xl backdrop-blur-md bg-card/80">
                    <CardHeader className="space-y-1 text-center">
                        <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
                            Bienvenido de nuevo
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Ingresa tus credenciales para acceder al sistema
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleLogin}>
                        <CardContent className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="username">Usuario</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="AdminRegency"
                                        className="pl-10 h-11"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">Contraseña</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        className="pl-10 h-11"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-4">
                            <Button
                                type="submit"
                                className="w-full h-11 text-base font-semibold gradient-primary shadow-lg hover:shadow-xl transition-all duration-300"
                                disabled={loading}
                            >
                                {loading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                        Iniciando sesión...
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5" />
                                        Iniciar Sesión
                                    </div>
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <p className="mt-8 text-center text-sm text-muted-foreground">
                    Sistema de Gestión de Datos Regency • {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
};

export default Login;
