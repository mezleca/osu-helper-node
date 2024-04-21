import fs from "fs";
import path from "path";
import axios from "axios";
import pMap from 'p-map';
import Terminal from "terminal-kit";

import { OsuReader } from "../reader/reader.js";
import { config } from "../../other/config.js";
import { login } from "../index.js";
import { check_path, handle_prompt, show_menu } from "../../other/utils.js";

check_path();

const reader = new OsuReader();
const osu_path = config.get("osu_path");
const osu_file = fs.readFileSync(path.resolve(osu_path, "osu!.db"));
const collection_file = fs.readFileSync(path.resolve(osu_path, "collection.db"));

let missing_maps = [];
let invalid = [];
let last_log = "";

const invalid_maps = [];

const mirrors = [
    {
        name: "chimue",
        url: "https://api.chimu.moe/v1/download/"
    },
    {
        name: "nerinyan",
        url: "https://api.nerinyan.moe/d/"
    },
    {
        name: "direct",
        url: "https://api.osu.direct/d/"
    }
];

export const search_map_id = async (hash) => {

    try {

        const base = "https://osu.ppy.sh/api/v2/beatmaps/lookup?"
        const response = await axios.get(`${base}checksum=${hash}`, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${login.access_token}`
            }
        });

        const data = await response.data;

        return data;
    } catch(err) {
        //console.log(err)
        if (err.response) {
            return false; 
        }
        return false;
    }
};

const download_map = async (b) => {

    const Path = path.resolve(config.get("osu_songs_folder"), `${b}.osz`);

    for (let i = 0; i < mirrors.length; i++) {

        const api = mirrors[i];
        const params = {};

        if (api.name == "nerinyan") {
            params.NoHitsound = "true";
            params.NoStoryBoard = true;
        }

        try {

            const response = await axios.get(`${api.url}${b}`, { method: "GET", params, responseType: "arraybuffer" });
            const buffer = response.data;

            if (response.status != 200) {
                continue;
            }

            fs.writeFileSync(Path, Buffer.from(buffer));
        } catch(err) {

            //console.log(err)

            if (i == mirrors.length - 1) {
                last_log = "Failed to find beatmap id: " + b;
            }

            continue;
        }
        break;
    }
    
};

Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max);
};

let pirocas = ["|", "/", "-", "\\"];
let current_piroca = 0;

const progress_bar = (start, end) => {

    let sp = " "; 
    let bar = "█"; 

    current_piroca++;
    if (current_piroca > pirocas.length - 1) {
        current_piroca = 0;
    }

    let perc = Math.floor(start / end * 100).clamp(0, 100);
    let bars = Math.floor(perc / 10).clamp(0, 10); 

    let lines = last_log ? 3 : 1;

    for (let i = 0; i < lines - 1; i++) {
        process.stdout.moveCursor(0, -1);
        process.stdout.clearLine(0);
    }
    
    if (last_log !== '') {
        process.stdout.cursorTo(0);
        process.stdout.write(`\nLOG -> ${last_log}\n`);
    }

    process.stdout.cursorTo(0);
    process.stdout.write(`downloading: [${bar.repeat(bars)}${sp.repeat((10 - bars).clamp(0, 10))}] ${perc}% ${pirocas[current_piroca]}`);
}

const download_maps = async (map, index) => {

    const hash = map.hash;
    
    try {

        progress_bar(index, missing_maps.length);

        if (!map.id) {
            
            const id = (await search_map_id(hash)).beatmapset_id;
            if (!id) {
                last_log = "Failed to find beatmap id: " + map.hash;
                invalid_maps.push({ hash: map.hash });
                return;
            }

            map.id = id;
        }

        await download_map(map.id);
           
    } catch(error) {
        invalid_maps.push({ hash: map.id });
        last_log = "Failed to find beatmap hash: " + map.hash;
        //console.log(error)
    }
};

const download_things = async () => {
    
    if (await handle_prompt("download from a specific collection? (y/n): ") == "y") {

        const collections = [...new Set(missing_maps.map(a => a.collection_name))];

        // print all collections name
        console.log("collections:", collections.join("\n"));

        const name = await handle_prompt("collection name: ");

        missing_maps = missing_maps.filter((a) => { return a.collection_name == name });

        if (!missing_maps) {
            console.log("collection not found.");
            return;
        }
        
        console.log("Found:", missing_maps.length, "maps");
    }

    await pMap(missing_maps, download_maps, { concurrency: 5 }); 

    console.log(`\ndone!`);

    if (invalid_maps.length > 0) {
        console.log(`\nfailed to download ${invalid_maps.length} maps.\nreason: outdated/invalid map.\n`);
    }
};

const export_shit = async () => {

    const ids = [];

    if (await handle_prompt("export from a specific collection? (y/n): ") == "y") {

        const collections = [...new Set(missing_maps.map(a => a.collection_name))];

        // print all collections name
        console.log("collections:", collections.join("\n"));

        const name = await handle_prompt("collection name: ");
        missing_maps = missing_maps.filter((a) => { return a.collection_name == name })

        if (!missing_maps) {
            console.log("collection not found.");
            return;
        }
        
        console.log("Found:", missing_maps.length, "maps");
    }

    console.log("\nsearching beatmap id's... ( this might take a while )");

    await new Promise(async (re) => {

        for (let i = 0; i < missing_maps.length; i++) {

            const map = missing_maps[i];

            try {
            
                const hash = map.hash;
                const info = await search_map_id(hash);   
                
                if (info.beatmapset_id) {
                    ids.push(`https://osu.ppy.sh/beatmapsets/${info.beatmapset_id}`);
                }
    
            } catch(err) {
                //console.log(err);
                invalid.push({ hash: map.hash });
                throw err;
            }    
        }

        re();
    });

    // remove duplicate maps.
    const o = [...new Set(ids)];

    fs.writeFileSync(path.resolve("./data/beatmaps.json"), JSON.stringify(o, null , 4));

    console.log("\nbeatmaps.json has been saved in the data folder\n");
};

const get_tournament_maps = async(id) => {
    const response = await axios.get(`https://osucollector.com/api/tournaments/${id}`);
    const data = response.data;

    const maps = [];
    const collection = {};
    const rounds = data.rounds;

    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i].mods;
        for (let k = 0; k < round.length; k++) {
            const mods = round[k].maps;
            maps.push(...mods);
        }
    }

    collection.name = data.name;
    collection.status = response.status;
    collection.beatmapsets = maps;

    return collection;
};

const options = [
    {
        name: "download",
        callback: download_things
    },
    {
        name: "export beatmaps to a json file",
        callback: export_shit
    }
];

export const get_beatmaps_collector = async () => {

    if (!login) {
        console.log("\nPlease restart the script to use this feature\n");
        return;
    }

    console.clear();

    // get collection maps
    const url = await handle_prompt("url: ");

    // get collection id
    const url_array = url.split("/");
    const collection_id = url_array[url_array.length - 2];

    if (!collection_id) {
        console.log("\nInvalid URL\n");
        return;
    }

    // request collection data from osuCollector api
    const is_tournament = url_array.includes("tournaments");
    const collection_url = `https://osucollector.com/api/collections/${collection_id}`;
    const Rcollection = is_tournament ? await get_tournament_maps(collection_id) : await axios.get(collection_url);
    const collection = is_tournament ? Rcollection : Rcollection.data;

    if (Rcollection.status != 200) {
        return console.log("\ncollection not found");
    }

    if (!collection.beatmapsets) {
        console.log("\nFailed to get collection from osu collector\n");
        return;
    }

    reader.set_type("osu");
    reader.set_buffer(osu_file, true);

    if (!reader.osu.beatmaps) {

        console.log("reading osu.db file...\n");

        await reader.get_osu_data();
        
        for (let i = 0; i < reader.osu.beatmaps; i++) {
            reader.osu.beatmaps[i].sr = [];
            reader.osu.beatmaps[i].timing_points = [];
        }
    }

    // TODO: make this more readable and less stupid.
    // get maps that are currently missing
    const maps_hashes = new Set(reader.osu.beatmaps.map((beatmap) => beatmap.md5));
    const collection_hashes = is_tournament ? 
    [...new Set(
        collection.beatmapsets.map((b) => b.checksum)
    )]
    : // else
    [...new Set(
        collection.beatmapsets.flatMap(
          (b) => b.beatmaps.map((b) => b.checksum)
        )
    )];
    
    const filtered_maps = is_tournament ?
    collection.beatmapsets.filter((beatmap) => {
        return !maps_hashes.has(beatmap.checksum) && beatmap.checksum && beatmap.beatmapset;
    }).map((b) => b.beatmapset )
    : // else
    collection.beatmapsets.filter((beatmapset) => {
        return !beatmapset.beatmaps.some((beatmap) => maps_hashes.has(beatmap.checksum));
    });

    console.log(`Found ${filtered_maps.length} missing maps`);

    const confirmation = await handle_prompt("download? (y or n): ");
    if (confirmation == "y") {

        missing_maps = filtered_maps;

        await pMap(missing_maps, download_maps, { concurrency: 5 }); 
    
        // clean progress bar line
        process.stdout.clearLine(); 
        process.stdout.cursorTo(0); 
    
        console.log(`\ndone!`);

        if (invalid_maps.length > 0) {
            console.log(`\nfailed to download ${invalid_maps.length} maps.\nreason: outdated/invalid map.\n`);
        }
    }

    const create_new_collection = await handle_prompt("add the collection to osu? (y or n): ");
    if (create_new_collection != "y") {
        return;
    }

    reader.set_type("collection");
    reader.set_buffer(collection_file, true);

    if (reader.collections.length == 0) {
        await reader.get_collections_data();
    }

    reader.collections.beatmaps.push({
        name: "!helper - " + collection.name,
        maps: collection_hashes
    });

    reader.collections.length++;

    const buffer = await reader.write_collections_data();
    const backup_name = `collection_backup_${Date.now()}.db`;

    // backup 
    fs.renameSync(path.resolve(config.get("osu_path"), "collection.db"), path.resolve(config.get("osu_path"), backup_name));
    // write the new one
    fs.writeFileSync(path.resolve(config.get("osu_path"), "collection.db"), Buffer.from(buffer));

    console.clear();

    console.log("\nYour collection file has been updated!\nA backup file named", backup_name, "has been created in your osu directory\nrename it to collection.db in case the new one is corrupted\n");
}

export const missing_initialize = async () => {

    // check if data folder exists
    if (!fs.existsSync("./data/")) {
        fs.mkdirSync("./data/");
    }
    
    // initialize for reading osu!.db
    reader.set_type("osu");
    reader.set_directory(osu_path);
    reader.set_buffer(osu_file, true);

    await reader.get_osu_data();

    // only the hash/id will be used
    reader.osu.beatmaps.map((b, i) => {
        reader.osu.beatmaps[i] = { hash: b.md5, id: b.beatmap_id };
    });

    // initialize for reading collection.db
    reader.set_type("collection");
    reader.set_buffer(collection_file, true);

    if (reader.collections.length == 0) {
        await reader.get_collections_data();
    }
    
    const hashes = new Set(reader.osu.beatmaps.map(b => b.hash));
    const Maps = reader.collections.beatmaps.map((b) => { return { name: b.name, maps: b.maps } });

    // verify things
    for (const map of Maps) {

        missing_maps.push({ name: map.name });

        for (const m of map.maps) {
            if (!hashes.has(m)) {
                if (m != "4294967295") {
                    missing_maps.push({ collection_name: map.name, hash: m });
                }
                else {
                    invalid.push({ hash: m });
                }
            }
        }
    }

    console.log(`found ${missing_maps.length} missing maps\n${invalid.length} are unknown maps.`); 

    await show_menu(options);

    console.clear();

    if (!login) {
        console.log("\nPlease restart the script to use this feature\n");
        return;
    }

    return;
};