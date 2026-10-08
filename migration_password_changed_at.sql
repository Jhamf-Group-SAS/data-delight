-- Invalida tokens emitidos antes del ultimo cambio de contraseña.
-- Idempotente a nivel de app: server.js tambien asegura la columna al arrancar.
ALTER TABLE usuarios ADD COLUMN password_changed_at DATETIME NULL;
