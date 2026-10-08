-- =============================================================
-- MIGRACION: Sistema Multi-Usuario Regency
-- Ejecutar en registros_regency, sentencia por sentencia
-- =============================================================


-- PASO 1: Tabla de usuarios
-- =============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id         INT          NOT NULL AUTO_INCREMENT,
  username   VARCHAR(100) NOT NULL,
  password   VARCHAR(255) NOT NULL,
  nombre     VARCHAR(255) NOT NULL,
  rol        ENUM('admin','operador') NOT NULL DEFAULT 'operador',
  activo     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  password_changed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_username (username)
);


-- PASO 2: Agregar columna user_id en registros
-- =============================================================
ALTER TABLE registros
  ADD COLUMN user_id INT NULL AFTER id_registro;


-- PASO 3: Agregar columna created_at en registros
-- =============================================================
ALTER TABLE registros
  ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status;


-- PASO 4: Indice para performance por usuario
-- =============================================================
ALTER TABLE registros
  ADD INDEX idx_registros_user_id (user_id);


-- PASO 5: Clave foranea user_id -> usuarios.id
-- =============================================================
ALTER TABLE registros
  ADD CONSTRAINT fk_registros_usuario
  FOREIGN KEY (user_id)
  REFERENCES usuarios(id)
  ON DELETE SET NULL;


-- VERIFICACION: mostrar estructura final
-- =============================================================
DESC usuarios;
DESC registros;
