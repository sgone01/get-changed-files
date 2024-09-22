"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const GitHub = __importStar(require("@actions/github"));
const github_1 = require("@actions/github");
const fs_1 = require("fs");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        try {
            const client = GitHub.getOctokit(core.getInput('token', { required: true }));
            const format = core.getInput('format', { required: true });
            const excludeFilePath = core.getInput('exclude-file', { required: false });
            // Read the exclude file if it exists
            let exclusions = new Set();
            if (excludeFilePath) {
                try {
                    const data = yield fs_1.promises.readFile(excludeFilePath, 'utf-8');
                    // Split the file content into lines, trim whitespace, and filter out lines starting with '#'
                    const lines = data
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0 && !line.startsWith('#'));
                    // If no valid lines found
                    if (lines.length === 0) {
                        core.info("exclude-file doesn't have anything to exclude.");
                    }
                    else {
                        exclusions = new Set(lines);
                    }
                }
                catch (error) {
                    // Handle any file read errors
                    if (error instanceof Error) {
                        core.info(`Error reading exclude-file: ${error.message}`);
                    }
                    else {
                        core.info(`exclude-file not present: ${excludeFilePath}`);
                    }
                }
            }
            else {
                core.info('exclude-file not present');
            }
            // let exclusions: Set<string> = new Set()
            // if (excludeFilePath) {
            //   try {
            //     const data = await fs.readFile(excludeFilePath, 'utf-8')
            //     const lines = data.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
            //     if (lines.length === 0) {
            //       core.info("exclude-file doesn't have anything to exclude.");
            //     } else {
            //       exclusions = new Set(lines)
            //     }
            //   } catch (error) {
            //     core.info(`exclude-file not present: ${excludeFilePath}`);
            //   }
            // } else {
            //   core.info("exclude-file not present");
            // }
            // Get base and head commits
            let base = (_c = (_b = (_a = github_1.context.payload.pull_request) === null || _a === void 0 ? void 0 : _a.base) === null || _b === void 0 ? void 0 : _b.sha) !== null && _c !== void 0 ? _c : '';
            let head = (_f = (_e = (_d = github_1.context.payload.pull_request) === null || _d === void 0 ? void 0 : _d.head) === null || _e === void 0 ? void 0 : _e.sha) !== null && _f !== void 0 ? _f : '';
            const eventName = github_1.context.eventName;
            switch (eventName) {
                case 'pull_request':
                    base = (_h = (_g = github_1.context.payload.pull_request) === null || _g === void 0 ? void 0 : _g.base) === null || _h === void 0 ? void 0 : _h.sha;
                    head = (_k = (_j = github_1.context.payload.pull_request) === null || _j === void 0 ? void 0 : _j.head) === null || _k === void 0 ? void 0 : _k.sha;
                    break;
                case 'push':
                    base = github_1.context.payload.before;
                    head = github_1.context.payload.after;
                    break;
                default:
                    core.setFailed(`This action only supports pull requests and pushes, ${eventName} events are not supported.`);
            }
            // Log the base and head commits
            core.info(`Base commit: ${base}`);
            core.info(`Head commit: ${head}`);
            if (!base || !head) {
                core.setFailed(`The base and head commits are missing from the payload for this ${eventName} event.`);
                return;
            }
            // Use GitHub's compare two commits API
            const response = yield client.rest.repos.compareCommits({
                base,
                head,
                owner: github_1.context.repo.owner,
                repo: github_1.context.repo.repo
            });
            if (response.status !== 200) {
                core.setFailed(`The GitHub API for comparing commits returned ${response.status}, expected 200.`);
                return;
            }
            if (response.data.status !== 'ahead') {
                core.setFailed(`The head commit is not ahead of the base commit.`);
                return;
            }
            // Process the changed files
            const files = response.data.files;
            if (!files) {
                core.setFailed('No files were found in the compare commits response.');
                return;
            }
            const all = [], added = [], modified = [], removed = [], renamed = [], addedModified = [], skipped = [];
            for (const file of files) {
                const filename = file.filename;
                // Check if the file should be excluded
                if (exclusions.has(filename)) {
                    skipped.push(filename);
                    core.info(`Excluding file: ${filename}`);
                    continue; // Skip this file
                }
                // Check for space in filename if using 'space-delimited'
                if (format === 'space-delimited' && filename.includes(' ')) {
                    core.setFailed(`One of your files includes a space. Consider using a different output format or removing spaces from your filenames.`);
                    return;
                }
                all.push(filename);
                switch (file.status) {
                    case 'added':
                        added.push(filename);
                        addedModified.push(filename);
                        break;
                    case 'modified':
                        modified.push(filename);
                        addedModified.push(filename);
                        break;
                    case 'removed':
                        removed.push(filename);
                        break;
                    case 'renamed':
                        renamed.push(filename);
                        break;
                    default:
                        core.setFailed(`One of your files includes an unsupported file status '${file.status}', expected 'added', 'modified', 'removed', or 'renamed'.`);
                        return;
                }
            }
            // Format the arrays of changed files
            let allFormatted, addedFormatted, modifiedFormatted, removedFormatted, renamedFormatted, addedModifiedFormatted;
            switch (format) {
                case 'space-delimited':
                    allFormatted = all.join(' ');
                    addedFormatted = added.join(' ');
                    modifiedFormatted = modified.join(' ');
                    removedFormatted = removed.join(' ');
                    renamedFormatted = renamed.join(' ');
                    addedModifiedFormatted = addedModified.join(' ');
                    break;
                case 'csv':
                    allFormatted = all.join(',');
                    addedFormatted = added.join(',');
                    modifiedFormatted = modified.join(',');
                    removedFormatted = removed.join(',');
                    renamedFormatted = renamed.join(',');
                    addedModifiedFormatted = addedModified.join(',');
                    break;
                case 'json':
                    allFormatted = JSON.stringify(all);
                    addedFormatted = JSON.stringify(added);
                    modifiedFormatted = JSON.stringify(modified);
                    removedFormatted = JSON.stringify(removed);
                    renamedFormatted = JSON.stringify(renamed);
                    addedModifiedFormatted = JSON.stringify(addedModified);
                    break;
            }
            const skippedFormatted = skipped.join(', ');
            core.info(`Skipped: ${skippedFormatted}`);
            // Log the output values
            core.info(`All: ${allFormatted}`);
            core.info(`Added: ${addedFormatted}`);
            core.info(`Modified: ${modifiedFormatted}`);
            core.info(`Removed: ${removedFormatted}`);
            core.info(`Renamed: ${renamedFormatted}`);
            core.info(`Added or modified: ${addedModifiedFormatted}`);
            // Set step output context
            core.setOutput('all', allFormatted);
            core.setOutput('added', addedFormatted);
            core.setOutput('modified', modifiedFormatted);
            core.setOutput('removed', removedFormatted);
            core.setOutput('renamed', renamedFormatted);
            core.setOutput('added_modified', addedModifiedFormatted);
            core.setOutput('skipped', skippedFormatted);
        }
        catch (error) {
            core.setFailed(error instanceof Error ? error.message : String(error));
        }
    });
}
run();
