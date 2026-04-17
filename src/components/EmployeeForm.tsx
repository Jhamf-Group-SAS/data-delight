import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus } from "lucide-react";
import { EmployeeFormData } from "@/types/employee";
import { toast } from "sonner";

interface EmployeeFormProps {
  onSubmit: (data: EmployeeFormData) => void;
}

const EmployeeForm = ({ onSubmit }: EmployeeFormProps) => {
  const [formData, setFormData] = useState<EmployeeFormData>({
    proyecto: "",
    centroOperacion: "",
    cargo: "",
    cedula: "",
    nombre: "",
    numero: "",
    status: "NO", // 👈 se envía, pero no se muestra
  });

  const validarIndicativo = (numero) => {
    // Indicativos comunes (puedes agregar más según necesites)
    const indicativosValidos = [
      /^1\d{10}$/,      // USA/Canadá: 1 + 10 dígitos
      /^52\d{10}$/,     // México: 52 + 10 dígitos
      /^57\d{10}$/,     // Colombia: 57 + 10 dígitos
      /^54\d{10}$/,     // Argentina: 54 + 10 dígitos
      /^51\d{9}$/,      // Perú: 51 + 9 dígitos
      /^56\d{9}$/,      // Chile: 56 + 9 dígitos
      /^34\d{9}$/,      // España: 34 + 9 dígitos
      /^593\d{9}$/,     // Ecuador: 593 + 9 dígitos
      /^58\d{10}$/,     // Venezuela: 58 + 10 dígitos
      /^507\d{8}$/,     // Panamá: 507 + 8 dígitos
    ];

    return indicativosValidos.some(regex => regex.test(numero));
  };

  const handleChange = (field: keyof EmployeeFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.proyecto || !formData.nombre || !formData.cedula) {
      toast.error("Por favor complete los campos requeridos");
      return;
    }

    // 👉 status viaja aquí aunque no esté en el UI
    onSubmit(formData);

    setFormData({
      proyecto: "",
      centroOperacion: "",
      cargo: "",
      cedula: "",
      nombre: "",
      numero: "",
      status: "SI",
    });

    toast.success("Registro agregado exitosamente");
  };

  return (
    <Card className="card-shadow border-0">
      <CardHeader className="gradient-header rounded-t-xl">
        <CardTitle className="flex items-center gap-2 text-primary-foreground">
          <UserPlus className="h-5 w-5" />
          Nuevo Registro
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Proyecto */}
            <div className="space-y-2">
              <Label htmlFor="proyecto">Proyecto *</Label>
              <Select
                value={formData.proyecto}
                onValueChange={(value) => handleChange("proyecto", value)}
              >
                <SelectTrigger className="transition-all focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder="Seleccione un proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCENORTE">ACCENORTE</SelectItem>
                  <SelectItem value="RUTAS DEL VALLE">RUTAS DEL VALLE</SelectItem>
                  <SelectItem value="VINUS">VINUS</SelectItem>
                  <SelectItem value="GICA">GICA</SelectItem>
                  <SelectItem value="V40">V40</SelectItem>
                  <SelectItem value="CPC256">CPC256</SelectItem>
                  <SelectItem value="RUTA AL SUR">RUTA AL SUR</SelectItem>
                  <SelectItem value="CPC256 CONT">CPC256 CONT</SelectItem>
                  <SelectItem value="RUTA AL SUR CONT">RUTA AL SUR CONT</SelectItem>
                  <SelectItem value="RUTAS DEL VALLE CONT">RUTAS DEL VALLE CONT</SelectItem>
                  <SelectItem value="VINUS CONT">VINUS CONT</SelectItem>
                  <SelectItem value="GICA CONT">GICA CONT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Centro de Operación */}
            <div className="space-y-2">
              <Label htmlFor="centroOperacion">Centro de Operación</Label>
              <Input
                id="centroOperacion"
                value={formData.centroOperacion}
                onChange={(e) => handleChange("centroOperacion", e.target.value)}
                placeholder="Ej: Medellín"
              />
            </div>

            {/* Cargo */}
            <div className="space-y-2">
              <Label htmlFor="cargo">Cargo</Label>
              <Input
                id="cargo"
                value={formData.cargo}
                onChange={(e) => handleChange("cargo", e.target.value)}
                placeholder="Ej: Consultor"
              />
            </div>

            {/* Cédula */}
            <div className="space-y-2">
              <Label htmlFor="cedula">Cédula *</Label>
              <Input
                id="cedula"
                value={formData.cedula}
                onChange={(e) => handleChange("cedula", e.target.value)}
                placeholder="Ej: 125444354"
              />
            </div>

            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => handleChange("nombre", e.target.value)}
                placeholder="Ej: Daniel González"
              />
            </div>

            {/* Número */}
            <div className="space-y-2">
              <Label htmlFor="numero">Número</Label>
              <Input
                id="numero"
                value={formData.numero}
                onChange={(e) => {
                  const value = e.target.value;
                  // Solo permite números
                  if (value === '' || /^\d*$/.test(value)) {
                    handleChange("numero", value);
                  }
                }}
                onBlur={(e) => {
                  const numero = e.target.value;
                  if (numero && !validarIndicativo(numero)) {
                    alert('El número debe incluir un indicativo de país válido (ej: 57 para Colombia, 1 para USA, 52 para México)');
                  }
                }}
                placeholder="Ej: 573157690773"
              />
            </div>

            {/* STATUS OCULTO */}
            <input type="hidden" value={formData.status} />

          </div>

          <Button
            type="submit"
            className="w-full gradient-primary border-0 text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Agregar Registro al Formato
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default EmployeeForm;
