
/**
 * Solara 多歌单管理模块
 * 与原有播放队列、收藏夹相互独立
 */

const API = "/api/playlists";

async function request(path = "", options = {}) {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        },
        credentials: "same-origin"
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "歌单操作失败");
    }

    return data;
}

export async function getPlaylists() {
    return request();
}

export async function createPlaylist(name) {
    return request("", {
        method: "POST",
        body: JSON.stringify({ name })
    });
}

export async function renamePlaylist(id, name) {
    return request(`/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
    });
}

export async function deletePlaylist(id) {
    return request(`/${encodeURIComponent(id)}`, {
        method: "DELETE"
    });
}

export async function getPlaylistSongs(id) {
    return request(`/${encodeURIComponent(id)}/songs`);
}

export async function addPlaylistSongs(id, songs) {
    return request(`/${encodeURIComponent(id)}/songs`, {
        method: "POST",
        body: JSON.stringify({ songs })
    });
}

export async function removePlaylistSong(id, source, songId) {
    return request(
        `/${encodeURIComponent(id)}/songs/${encodeURIComponent(source)}/${encodeURIComponent(songId)}`,
        { method: "DELETE" }
    );
}
