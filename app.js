const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Servir archivos estáticos desde la carpeta public
app.use(express.static('public'));

// Configuración de la conexión a PostgreSQL en Neon
const db = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_hrL4ToRC5yGO@ep-dark-hat-a5lqxwxf-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: { rejectUnauthorized: false }
});

// Endpoint de Iniciar Sesión (Login)
app.post('/api/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    const sql = 'SELECT id, nombre, correo, rol FROM usuarios WHERE correo = $1 AND contrasena = $2';

    try {
        const results = await db.query(sql, [correo, contrasena]);
        if (results.rows.length > 0) {
            return res.json({ mensaje: 'Login exitoso', usuario: results.rows[0] });
        } else {
            return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
        }
    } catch (err) {
        console.error('Error Postgres en Login:', err);
        return res.status(500).json({ mensaje: 'Error en el servidor', detalle: err.message });
    }
});

// Endpoint para Cambiar Contraseña desde el Login
app.put('/api/cambiar-password', async (req, res) => {
    const { correo, claveActual, claveNueva } = req.body;

    try {
        const sqlVerificar = 'SELECT id FROM usuarios WHERE correo = $1 AND contrasena = $2';
        const results = await db.query(sqlVerificar, [correo, claveActual]);

        if (results.rows.length === 0) {
            return res.status(400).json({ mensaje: 'Correo o contraseña actual incorrectos' });
        }

        const sqlUpdate = 'UPDATE usuarios SET contrasena = $1 WHERE correo = $2';
        await db.query(sqlUpdate, [claveNueva, correo]);
        return res.json({ mensaje: 'Contraseña actualizada correctamente' });
    } catch (err) {
        console.error('Error Postgres en cambiar password:', err);
        return res.status(500).json({ mensaje: 'Error en el servidor' });
    }
});

// Obtener lista completa de usuarios
app.get('/api/usuarios', async (req, res) => {
    const sql = 'SELECT id, nombre, correo, contrasena, rol FROM usuarios ORDER BY id DESC';
    try {
        const results = await db.query(sql);
        return res.json(results.rows);
    } catch (err) {
        console.error('Error Postgres en obtener usuarios:', err);
        return res.status(500).json({ mensaje: 'Error al obtener usuarios', detalle: err.message });
    }
});

// Endpoint para agregar un nuevo usuario
app.post('/api/usuarios', async (req, res) => {
    const { nombre, correo, contrasena, rol } = req.body;

    if (!nombre || !correo || !contrasena || !rol) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
    }

    const sql = 'INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES ($1, $2, $3, $4) RETURNING id';
    try {
        const result = await db.query(sql, [nombre, correo, contrasena, rol]);
        return res.json({ 
            mensaje: 'Usuario creado correctamente', 
            id: result.rows[0].id 
        });
    } catch (err) {
        console.error('Error Postgres en agregar usuario:', err);
        return res.status(500).json({ mensaje: 'Error al registrar el usuario' });
    }
});

// Endpoint para actualizar un usuario existente (Permite omitir contraseña)
app.put('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, correo, contrasena, rol } = req.body;

    if (!nombre || !correo || !rol) {
        return res.status(400).json({ mensaje: 'Nombre, correo y rol son obligatorios' });
    }

    try {
        let sql, params;
        if (contrasena && contrasena.trim() !== '') {
            sql = 'UPDATE usuarios SET nombre = $1, correo = $2, contrasena = $3, rol = $4 WHERE id = $5';
            params = [nombre, correo, contrasena, rol, id];
        } else {
            sql = 'UPDATE usuarios SET nombre = $1, correo = $2, rol = $3 WHERE id = $4';
            params = [nombre, correo, rol, id];
        }

        await db.query(sql, params);
        return res.json({ mensaje: 'Usuario actualizado correctamente' });
    } catch (err) {
        console.error('Error al actualizar usuario:', err);
        return res.status(500).json({ mensaje: 'Error al actualizar el usuario' });
    }
});

// Eliminar un usuario por ID
app.delete('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const sql = 'DELETE FROM usuarios WHERE id = $1';
    try {
        await db.query(sql, [id]);
        return res.json({ mensaje: 'Usuario eliminado correctamente' });
    } catch (err) {
        console.error('Error Postgres en eliminar usuario:', err);
        return res.status(500).json({ mensaje: 'Error al eliminar el usuario' });
    }
});

// Registrar entrada (Practicante)
app.post('/api/asistencia', async (req, res) => {
    const { practicante_id } = req.body;

    try {
        const sqlVerificarPracticante = 'SELECT id FROM usuarios WHERE id = $1';
        const practicante = await db.query(sqlVerificarPracticante, [practicante_id]);

        if (practicante.rows.length === 0) {
            return res.status(404).json({ mensaje: 'El ID del usuario no existe' });
        }

        const sqlVerificarAsistencia = 'SELECT id FROM asistencias WHERE practicante_id = $1 AND fecha = CURRENT_DATE';
        const asistencias = await db.query(sqlVerificarAsistencia, [practicante_id]);

        if (asistencias.rows.length > 0) {
            return res.status(400).json({ mensaje: 'El usuario ya registró su entrada el día de hoy' });
        }

        const sqlInsert = `
            INSERT INTO asistencias (practicante_id, fecha, hora_entrada, estado) 
            VALUES (
                $1, 
                CURRENT_DATE, 
                CURRENT_TIME, 
                CASE 
                    WHEN CURRENT_TIME <= '08:00:00'::time THEN 'Puntual'
                    WHEN CURRENT_TIME <= '08:10:00'::time THEN 'Tolerancia'
                    ELSE 'Tardanza'
                END
            ) RETURNING id
        `;

        const result = await db.query(sqlInsert, [practicante_id]);
        return res.json({ mensaje: 'Entrada registrada correctamente', id: result.rows[0].id });
    } catch (err) {
        console.error('Error Postgres en insertar asistencia:', err);
        return res.status(500).json({ mensaje: 'Error al registrar la asistencia' });
    }
});

// Registrar salida (Practicante)
app.put('/api/asistencia/salida', async (req, res) => {
    const { practicante_id } = req.body;

    try {
        const sqlVerificarEntrada = 'SELECT id, hora_salida FROM asistencias WHERE practicante_id = $1 AND fecha = CURRENT_DATE';
        const asistencias = await db.query(sqlVerificarEntrada, [practicante_id]);

        if (asistencias.rows.length === 0) {
            return res.status(400).json({ mensaje: 'El usuario no ha registrado su entrada hoy' });
        }

        if (asistencias.rows[0].hora_salida !== null) {
            return res.status(400).json({ mensaje: 'El usuario ya registró su salida el día de hoy' });
        }

        const sqlUpdate = `
            UPDATE asistencias 
            SET hora_salida = CURRENT_TIME 
            WHERE practicante_id = $1 AND fecha = CURRENT_DATE AND hora_salida IS NULL
        `;

        await db.query(sqlUpdate, [practicante_id]);
        return res.json({ mensaje: 'Salida registrada correctamente' });
    } catch (err) {
        console.error('Error Postgres en registrar salida:', err);
        return res.status(500).json({ mensaje: 'Error al registrar la salida' });
    }
});

// Obtener historial completo
app.get('/api/asistencias', async (req, res) => {
    const sql = `
        SELECT 
            a.id, 
            a.practicante_id,
            u.nombre, 
            a.fecha, 
            a.hora_entrada, 
            a.hora_salida, 
            a.estado
        FROM asistencias a
        INNER JOIN usuarios u ON a.practicante_id = u.id
        ORDER BY a.id DESC
    `;
    try {
        const results = await db.query(sql);
        return res.json(results.rows);
    } catch (err) {
        console.error('Error Postgres en obtener asistencias:', err);
        return res.status(500).json({ mensaje: 'Error al obtener asistencias', detalle: err.message });
    }
});

// Editar registro de asistencia
app.put('/api/asistencias/:id', async (req, res) => {
    const { id } = req.params;
    const { hora_entrada, hora_salida, estado } = req.body;
    
    const sql = 'UPDATE asistencias SET hora_entrada = $1, hora_salida = $2, estado = $3 WHERE id = $4';
    try {
        await db.query(sql, [hora_entrada, hora_salida, estado, id]);
        return res.json({ mensaje: 'Registro actualizado correctamente' });
    } catch (err) {
        console.error('Error Postgres en editar asistencia:', err);
        return res.status(500).json({ mensaje: 'Error al actualizar el registro' });
    }
});

// Eliminar registro de asistencia
app.delete('/api/asistencias/:id', async (req, res) => {
    const { id } = req.params;
    const sql = 'DELETE FROM asistencias WHERE id = $1';
    try {
        await db.query(sql, [id]);
        return res.json({ mensaje: 'Registro eliminado correctamente' });
    } catch (err) {
        console.error('Error Postgres en eliminar asistencia:', err);
        return res.status(500).json({ mensaje: 'Error al eliminar el registro' });
    }
});

// Configuración del puerto para desarrollo local y producción
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado correctamente en el puerto ${PORT}`);
});