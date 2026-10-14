
const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });

export async function onRequest({ request, env, params }) {
    const expectedToken = env.PLAYLIST_TOKEN;
    if (!expectedToken || request.headers.get('X-Playlist-Token') !== expectedToken) return json({ error: 'Unauthorized' }, 401);
    const db = env.DB;
    if (!db) return json({ error: "D1 database not bound" }, 500);

    const segments = (params.path || [])
        .filter(Boolean)
        .map(decodeURIComponent);

    const method = request.method;
    const id = segments[0];
    const action = segments[1];

    try {
        if (!id) {
            if (method === "GET") {
                const result = await db.prepare(
                    "SELECT * FROM playlists ORDER BY created_at DESC"
                ).all();
                return json(result.results);
            }

            if (method === "POST") {
                const { name } = await request.json();
                if (!name?.trim()) {
                    return json({ error: "歌单名称不能为空" }, 400);
                }

                const playlistId = crypto.randomUUID();

                await db.prepare(
                    "INSERT INTO playlists (id, name) VALUES (?, ?)"
                ).bind(playlistId, name.trim()).run();

                return json({ id: playlistId, name: name.trim() }, 201);
            }
        }

        if (id && !action) {
            if (method === "PATCH") {
                const { name } = await request.json();
                if (!name?.trim()) {
                    return json({ error: "歌单名称不能为空" }, 400);
                }

                await db.prepare(
                    "UPDATE playlists SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
                ).bind(name.trim(), id).run();

                return json({ success: true });
            }

            if (method === "DELETE") {
                await db.batch([
                    db.prepare(
                        "DELETE FROM playlist_songs WHERE playlist_id=?"
                    ).bind(id),
                    db.prepare(
                        "DELETE FROM playlists WHERE id=?"
                    ).bind(id)
                ]);

                return json({ success: true });
            }
        }

        if (id && action === "songs") {
            if (method === "GET" && segments.length === 2) {
                const result = await db.prepare(
                    "SELECT song_data FROM playlist_songs WHERE playlist_id=? ORDER BY position"
                ).bind(id).all();

                return json(
                    result.results.map(row => JSON.parse(row.song_data))
                );
            }

            if (method === "POST" && segments.length === 2) {
                const { songs } = await request.json();

                if (!Array.isArray(songs)) {
                    return json({ error: "无效歌曲数据" }, 400);
                }

                const count = await db.prepare(
                    "SELECT COALESCE(MAX(position), -1) AS last FROM playlist_songs WHERE playlist_id=?"
                ).bind(id).first();

                let position = count.last + 1;

                const statements = songs.map(song => {
                    const source = String(song.source || "netease");
                    const songId = String(song.id || song.url_id || "");

                    if (!songId) return null;

                    return db.prepare(
                        `INSERT OR IGNORE INTO playlist_songs
                         (playlist_id, song_id, source, song_data, position)
                         VALUES (?, ?, ?, ?, ?)`
                    ).bind(
                        id, songId, source,
                        JSON.stringify(song), position++
                    );
                }).filter(Boolean);

                if (statements.length) await db.batch(statements);

                return json({ success: true });
            }

            if (method === "DELETE" && segments.length === 4) {
                await db.prepare(
                    "DELETE FROM playlist_songs WHERE playlist_id=? AND source=? AND song_id=?"
                ).bind(id, segments[2], segments[3]).run();

                return json({ success: true });
            }
        }

        return json({ error: "Not found" }, 404);
    } catch (error) {
        return json({ error: error.message }, 500);
    }
}
