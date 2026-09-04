const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Servir archivos estáticos desde la carpeta public
app.use(express.static('public'));

// Configuración de la conexión a MySQL en Clever Cloud
const db = mysql.createPool({
    host: process.env.DB_HOST || 'b1wvfuuu9bbjop29c51h-mysql.services.clever-cloud.com',
    user: process.env.DB_USER || 'uitp6eatsuspnyq6',
    password: process.env.DB_PASSWORD || 't0TDFd2mBCsv3rFxhDxK',
    database: process.env.DB_NAME || 'b1wvfuuu9bbjop29c51h',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Endpoint de Iniciar Sesión (Login)
app.post('/api/login', (req, res) => {
    const { correo, contrasena } = req.body;
    const sql = 'SELECT id, nombre, correo, rol FROM usuarios WHERE correo = ? AND contrasena = ?';

    db.query(sql, [correo, contrasena], (err, results) => {
        if (err) return res.status(500).json({ mensaje: 'Error en el servidor' });
        
        if (results.length > 0) {
            return res.json({ mensaje: 'Login exitoso', usuario: results[0] });
        } else {
            return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
        }
    });
});

// Endpoint para Cambiar Contraseña desde el Login
app.put('/api/cambiar-password', (req, res) => {
    const { correo, claveActual, claveNueva } = req.body;

    const sqlVerificar = 'SELECT id FROM usuarios WHERE correo = ? AND contrasena = ?';
    db.query(sqlVerificar, [correo, claveActual], (err, results) => {
        if (err) return res.status(500).json({ mensaje: 'Error en el servidor' });

        if (results.length === 0) {
            return res.status(400).json({ mensaje: 'Correo o contraseña actual incorrectos' });
        }

        const sqlUpdate = 'UPDATE usuarios SET contrasena = ? WHERE correo = ?';
        db.query(sqlUpdate, [claveNueva, correo], (err, result) => {
            if (err) return res.status(500).json({ mensaje: 'Error al cambiar la contraseña' });
            return res.json({ mensaje: 'Contraseña actualizada correctamente' });
        });
    });
});

// Obtener lista completa de usuarios
app.get('/api/usuarios', (req, res) => {
    const sql = 'SELECT id, nombre, correo, contrasena, rol FROM usuarios ORDER BY id DESC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        return res.json(results);
    });
});

// Endpoint para agregar un nuevo usuario
app.post('/api/usuarios', (req, res) => {
    const { nombre, correo, contrasena, rol } = req.body;

    if (!nombre || !correo || !contrasena || !rol) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
    }

    const sql = 'INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES (?, ?, ?, ?)';
    db.query(sql, [nombre, correo, contrasena, rol], (err, result) => {
        if (err) return res.status(500).json({ mensaje: 'Error al registrar el usuario' });
        
        return res.json({ 
            mensaje: 'Usuario creado correctamente', 
            id: result.insertId 
        });
    });
});

// Endpoint para actualizar un usuario existente (Permite omitir contraseña)
app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, correo, contrasena, rol } = req.body;

    if (!nombre || !correo || !rol) {
        return res.status(400).json({ mensaje: 'Nombre, correo y rol son obligatorios' });
    }

    let sql, params;
    if (contrasena && contrasena.trim() !== '') {
        sql = 'UPDATE usuarios SET nombre = ?, correo = ?, contrasena = ?, rol = ? WHERE id = ?';
        params = [nombre, correo, contrasena, rol, id];
    } else {
        sql = 'UPDATE usuarios SET nombre = ?, correo = ?, rol = ? WHERE id = ?';
        params = [nombre, correo, rol, id];
    }

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error('Error al actualizar usuario:', err);
            return res.status(500).json({ mensaje: 'Error al actualizar el usuario' });
        }
        return res.json({ mensaje: 'Usuario actualizado correctamente' });
    });
});

// Eliminar un usuario por ID
app.delete('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const sql = 'DELETE FROM usuarios WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ mensaje: 'Error al eliminar el usuario' });
        return res.json({ mensaje: 'Usuario eliminado correctamente' });
    });
});

// Registrar entrada (Practicante)
app.post('/api/asistencia', (req, res) => {
    const { practicante_id } = req.body;

    const sqlVerificarPracticante = 'SELECT id FROM usuarios WHERE id = ?';
    db.query(sqlVerificarPracticante, [practicante_id], (err, results) => {
        if (err) return res.status(500).json({ mensaje: 'Error en el servidor' });
        
        if (results.length === 0) {
            return res.status(404).json({ mensaje: 'El ID del usuario no existe' });
        }

        const sqlVerificarAsistencia = 'SELECT id FROM asistencias WHERE practicante_id = ? AND fecha = CURRENT_DATE()';
        db.query(sqlVerificarAsistencia, [practicante_id], (err, asistencias) => {
            if (err) return res.status(500).json({ mensaje: 'Error en el servidor' });

            if (asistencias.length > 0) {
                return res.status(400).json({ mensaje: 'El usuario ya registró su entrada el día de hoy' });
            }

            const sqlInsert = `
                INSERT INTO asistencias (practicante_id, fecha, hora_entrada, estado) 
                VALUES (
                    ?, 
                    CURRENT_DATE(), 
                    CURTIME(), 
                    CASE 
                        WHEN CURTIME() <= '08:00:00' THEN 'Puntual'
                        WHEN CURTIME() <= '08:10:00' THEN 'Tolerancia'
                        ELSE 'Tardanza'
                    END
                )
            `;

            db.query(sqlInsert, [practicante_id], (err, result) => {
                if (err) return res.status(500).json({ mensaje: 'Error al registrar la asistencia' });
                return res.json({ mensaje: 'Entrada registrada correctamente', id: result.insertId });
            });
        });
    });
});

// Registrar salida (Practicante)
app.put('/api/asistencia/salida', (req, res) => {
    const { practicante_id } = req.body;

    const sqlVerificarEntrada = 'SELECT id, hora_salida FROM asistencias WHERE practicante_id = ? AND fecha = CURRENT_DATE()';
    db.query(sqlVerificarEntrada, [practicante_id], (err, asistencias) => {
        if (err) return res.status(500).json({ mensaje: 'Error en el servidor' });

        if (asistencias.length === 0) {
            return res.status(400).json({ mensaje: 'El usuario no ha registrado su entrada hoy' });
        }

        if (asistencias[0].hora_salida !== null) {
            return res.status(400).json({ mensaje: 'El usuario ya registró su salida el día de hoy' });
        }

        const sqlUpdate = `
            UPDATE asistencias 
            SET hora_salida = CURTIME() 
            WHERE practicante_id = ? AND fecha = CURRENT_DATE() AND hora_salida IS NULL
        `;

        db.query(sqlUpdate, [practicante_id], (err, result) => {
            if (err) return res.status(500).json({ mensaje: 'Error al registrar la salida' });
            return res.json({ mensaje: 'Salida registrada correctamente' });
        });
    });
});

// Obtener historial completo
app.get('/api/asistencias', (req, res) => {
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
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        return res.json(results);
    });
});

// Editar registro de asistencia
app.put('/api/asistencias/:id', (req, res) => {
    const { id } = req.params;
    const { hora_entrada, hora_salida, estado } = req.body;
    
    const sql = 'UPDATE asistencias SET hora_entrada = ?, hora_salida = ?, estado = ? WHERE id = ?';
    db.query(sql, [hora_entrada, hora_salida, estado, id], (err, result) => {
        if (err) return res.status(500).json({ mensaje: 'Error al actualizar el registro' });
        return res.json({ mensaje: 'Registro actualizado correctamente' });
    });
});

// Eliminar registro de asistencia
app.delete('/api/asistencias/:id', (req, res) => {
    const { id } = req.params;
    const sql = 'DELETE FROM asistencias WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ mensaje: 'Error al eliminar el registro' });
        return res.json({ mensaje: 'Registro eliminado correctamente' });
    });
});

// Configuración del puerto para desarrollo local y producción
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado correctamente en el puerto ${PORT}`);
});