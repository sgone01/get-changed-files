import * as core from '@actions/core'
import * as GitHub from '@actions/github'
import {context} from '@actions/github'
import {promises as fs} from 'fs'

type Format = 'space-delimited' | 'csv' | 'json'
type FileStatus = 'added' | 'modified' | 'removed' | 'renamed'

async function run(): Promise<void> {
  try {
    const client = GitHub.getOctokit(core.getInput('token', {required: true}))
    const format = core.getInput('format', {required: true}) as Format
    const excludeFilePath = core.getInput('exclude-file', {required: false})

    // Read the exclude file if it exists
    let exclusions: Set<string> = new Set()

    if (excludeFilePath) {
      try {
        const data = await fs.readFile(excludeFilePath, 'utf-8')

        // Split the file content into lines, trim whitespace, and filter out lines starting with '#'
        const lines = data
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'))

        // If no valid lines found
        if (lines.length === 0) {
          core.info("exclude-file doesn't have anything to exclude.")
        } else {
          exclusions = new Set(lines)
        }
      } catch (error) {
        // Handle any file read errors
        if (error instanceof Error) {
          core.info(`Error reading exclude-file: ${error.message}`)
        } else {
          core.info(`exclude-file not present: ${excludeFilePath}`)
        }
      }
    } else {
      core.info('exclude-file not present')
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
    let base: string = context.payload.pull_request?.base?.sha ?? ''
    let head: string = context.payload.pull_request?.head?.sha ?? ''

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
        core.setFailed(`This action only supports pull requests and pushes, ${eventName} events are not supported.`)
    }

    // Log the base and head commits
    core.info(`Base commit: ${base}`)
    core.info(`Head commit: ${head}`)

    if (!base || !head) {
      core.setFailed(`The base and head commits are missing from the payload for this ${eventName} event.`)
      return
    }

    // Use GitHub's compare two commits API
    const response = await client.rest.repos.compareCommits({
      base,
      head,
      owner: context.repo.owner,
      repo: context.repo.repo
    })

    if (response.status !== 200) {
      core.setFailed(`The GitHub API for comparing commits returned ${response.status}, expected 200.`)
      return
    }

    if (response.data.status !== 'ahead') {
      core.setFailed(`The head commit is not ahead of the base commit.`)
      return
    }

    // Process the changed files
    const files = response.data.files

    if (!files) {
      core.setFailed('No files were found in the compare commits response.')
      return
    }
    const all: string[] = [],
      added: string[] = [],
      modified: string[] = [],
      removed: string[] = [],
      renamed: string[] = [],
      addedModified: string[] = [],
      skipped: string[] = []

    for (const file of files) {
      const filename = file.filename
      // Check if the file should be excluded
      if (exclusions.has(filename)) {
        skipped.push(filename)
        core.info(`Excluding file: ${filename}`)
        continue // Skip this file
      }

      // Check for space in filename if using 'space-delimited'
      if (format === 'space-delimited' && filename.includes(' ')) {
        core.setFailed(
          `One of your files includes a space. Consider using a different output format or removing spaces from your filenames.`
        )
        return
      }

      switch (file.status as FileStatus) {
        case 'added':
          added.push(filename)
          addedModified.push(filename)
          break
        case 'modified':
          modified.push(filename)
          addedModified.push(filename)
          break
        case 'removed':
          removed.push(filename)
          break
        case 'renamed':
          renamed.push(filename)
          break
        default:
          core.setFailed(
            `One of your files includes an unsupported file status '${file.status}', expected 'added', 'modified', 'removed', or 'renamed'.`
          )
          return
      }
    }

    if (files.length === 0 || added.length === 0) {
      core.info('No files matched exclusion. Adding all files to added array.')
      all.push(...files.map(file => file.filename))
    }

    // Format the arrays of changed files
    let allFormatted: string,
      addedFormatted: string,
      modifiedFormatted: string,
      removedFormatted: string,
      renamedFormatted: string,
      addedModifiedFormatted: string,
      skippedFormatted: string

    switch (format) {
      case 'space-delimited':
        skippedFormatted = all.join(' ')
        allFormatted = all.join(' ')
        addedFormatted = added.join(' ')
        modifiedFormatted = modified.join(' ')
        removedFormatted = removed.join(' ')
        renamedFormatted = renamed.join(' ')
        addedModifiedFormatted = addedModified.join(' ')
        break
      case 'csv':
        skippedFormatted = all.join(' ')
        allFormatted = all.join(',')
        addedFormatted = added.join(',')
        modifiedFormatted = modified.join(',')
        removedFormatted = removed.join(',')
        renamedFormatted = renamed.join(',')
        addedModifiedFormatted = addedModified.join(',')
        break
      case 'json':
        skippedFormatted = JSON.stringify(skipped)
        allFormatted = JSON.stringify(all)
        addedFormatted = JSON.stringify(added)
        modifiedFormatted = JSON.stringify(modified)
        removedFormatted = JSON.stringify(removed)
        renamedFormatted = JSON.stringify(renamed)
        addedModifiedFormatted = JSON.stringify(addedModified)
        break
    }

    skippedFormatted && core.info(`Skipped: ${skippedFormatted}`)

    // Log the output values
    allFormatted && core.info(`All: ${allFormatted}`)
    addedFormatted && core.info(`Added: ${addedFormatted}`)
    modifiedFormatted && core.info(`Modified: ${modifiedFormatted}`)
    removedFormatted && core.info(`Removed: ${removedFormatted}`)
    renamedFormatted && core.info(`Renamed: ${renamedFormatted}`)
    addedModifiedFormatted && core.info(`Added or modified: ${addedModifiedFormatted}`)

    // Set step output context
    allFormatted && core.setOutput('all', allFormatted)
    addedFormatted && core.setOutput('added', addedFormatted)
    modifiedFormatted && core.setOutput('modified', modifiedFormatted)
    removedFormatted && core.setOutput('removed', removedFormatted)
    renamedFormatted && core.setOutput('renamed', renamedFormatted)
    addedModifiedFormatted && core.setOutput('added_modified', addedModifiedFormatted)
    skippedFormatted && core.setOutput('skipped', skippedFormatted)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()
