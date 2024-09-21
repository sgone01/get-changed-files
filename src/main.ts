import * as core from '@actions/core'
import * as GitHub from '@actions/github'
import { context } from '@actions/github'
import { promises as fs } from 'fs'

type Format = 'space-delimited' | 'csv' | 'json'
type FileStatus = 'added' | 'modified' | 'removed' | 'renamed'

async function run(): Promise<void> {
  try {
    const client = GitHub.getOctokit(core.getInput('token', { required: true }))
    const format = core.getInput('format', { required: true }) as Format
    const excludeFilePath = core.getInput('exclude-file', { required: false })

    // Read the exclude file if it exists
    let exclusions: Set<string> = new Set()
    if (excludeFilePath) {
      try {
        const fileContent = await fs.readFile(excludeFilePath, 'utf-8');
        const lines = fileContent.split('\n').filter(line => {
          // Ignore lines that start with '#' (comments) or are empty
          const trimmedLine = line.trim();
          return trimmedLine.length > 0 && !trimmedLine.startsWith('#');
        });
        return lines;
      } catch (err) {
        core.setFailed(`Error reading exclude file: ${err.message}`);
        return;
      }
    } else {
      core.info("exclude-file not present");
    }

    // Get base and head commits
    let base: string = context.payload.pull_request?.base?.sha ?? '';
    let head: string = context.payload.pull_request?.head?.sha ?? '';

    const eventName = context.eventName
    switch (eventName) {
      case 'pull_request':
        base = context.payload.pull_request?.base?.sha
        head = context.payload.pull_request?.head?.sha
        break
      case 'push':
        base = context.payload.before
        head = context.payload.after
        break
      default:
        core.setFailed(
          `This action only supports pull requests and pushes, ${eventName} events are not supported.`
        )
    }

    // Log the base and head commits
    core.info(`Base commit: ${base}`)
    core.info(`Head commit: ${head}`)

    if (!base || !head) {
      core.setFailed(`The base and head commits are missing from the payload for this ${eventName} event.`);
      return;
    }

    // Use GitHub's compare two commits API
    const response = await client.rest.repos.compareCommits({
      base,
      head,
      owner: context.repo.owner,
      repo: context.repo.repo
    })

    if (response.status !== 200) {
      core.setFailed(`The GitHub API for comparing commits returned ${response.status}, expected 200.`);
      return;
    }

    if (response.data.status !== 'ahead') {
      core.setFailed(`The head commit is not ahead of the base commit.`);
      return;
    }

    // Process the changed files
    const files = response.data.files

    if (!files) {
      core.setFailed('No files were found in the compare commits response.');
      return;
    }
    const all: string[] = [],
      added: string[] = [],
      modified: string[] = [],
      removed: string[] = [],
      renamed: string[] = [],
      addedModified: string[] = []

    for (const file of files) {
      const filename = file.filename;

      // Check if the file should be excluded
      if (exclusions.has(filename)) {
        core.info(`Excluding file: ${filename}`);
        continue; // Skip this file
      }

      // Check for space in filename if using 'space-delimited'
      if (format === 'space-delimited' && filename.includes(' ')) {
        core.setFailed(
          `One of your files includes a space. Consider using a different output format or removing spaces from your filenames.`
        );
        return;
      }
      
      all.push(filename);
      switch (file.status as FileStatus) {
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
          core.setFailed(
            `One of your files includes an unsupported file status '${file.status}', expected 'added', 'modified', 'removed', or 'renamed'.`
          );
          return;
      }
    }

    // Format the arrays of changed files
    let allFormatted: string,
      addedFormatted: string,
      modifiedFormatted: string,
      removedFormatted: string,
      renamedFormatted: string,
      addedModifiedFormatted: string;

    switch (format) {
      case 'space-delimited':
        allFormatted = all.join(' ')
        addedFormatted = added.join(' ')
        modifiedFormatted = modified.join(' ')
        removedFormatted = removed.join(' ')
        renamedFormatted = renamed.join(' ')
        addedModifiedFormatted = addedModified.join(' ')
        break
      case 'csv':
        allFormatted = all.join(',')
        addedFormatted = added.join(',')
        modifiedFormatted = modified.join(',')
        removedFormatted = removed.join(',')
        renamedFormatted = renamed.join(',')
        addedModifiedFormatted = addedModified.join(',')
        break
      case 'json':
        allFormatted = JSON.stringify(all)
        addedFormatted = JSON.stringify(added)
        modifiedFormatted = JSON.stringify(modified)
        removedFormatted = JSON.stringify(removed)
        renamedFormatted = JSON.stringify(renamed)
        addedModifiedFormatted = JSON.stringify(addedModified)
        break
    }

    // Log the output values
    core.info(`All: ${allFormatted}`)
    core.info(`Added: ${addedFormatted}`)
    core.info(`Modified: ${modifiedFormatted}`)
    core.info(`Removed: ${removedFormatted}`)
    core.info(`Renamed: ${renamedFormatted}`)
    core.info(`Added or modified: ${addedModifiedFormatted}`)

    // Set step output context
    core.setOutput('all', allFormatted)
    core.setOutput('added', addedFormatted)
    core.setOutput('modified', modifiedFormatted)
    core.setOutput('removed', removedFormatted)
    core.setOutput('renamed', renamedFormatted)
    core.setOutput('added_modified', addedModifiedFormatted)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
