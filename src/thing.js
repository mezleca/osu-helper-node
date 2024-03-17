import fs from "fs";
import path from "path";
import PromptSync from "prompt-sync";

// login :3
export const login = await check_login();

import { missing_initialize } from "./functions/missing_maps.js";
import { download_initialize } from "./functions/download_maps.js";
import { get_invalid_maps } from "./functions/collections.js";
import { check_login  } from "./utils.js";

const prompt = PromptSync();
const menu_options = [
    {
        name: "get missing beatmaps from collections",
        func: missing_initialize
    },
    {
        name: "download maps from a json",
        func: download_initialize
    },
    {
        name: "remove invalid maps from collections",
        func: get_invalid_maps
    }
];

const select_option = () => {

    for (let i = 0; i < menu_options.length; i++) {
        console.log(`[${i}] - ${menu_options[i].name}`);
    }

    console.log("\n");

    return prompt("select a option: ");
};

let current_option = null;

const main = async () => {

    console.clear();
    
    while (true) {

        console.log("osu-thing v0.25 ( type exit to... exit? )\n");
        
        if (current_option == null) {
            current_option = select_option();
        }

        if (current_option == "exit") {
            break;
        }

        current_option = Number(current_option);

        if (current_option > menu_options.length || isNaN(current_option)) {
            console.log("invalid option");
            current_option = null;
            return;
        }

        await menu_options[current_option].func();
        current_option = null;

        // timeout
        await new Promise((re, rej) => {
            const interval = setInterval(() => { clearInterval(interval); re() }, 1000);
        });
    }
};

main();