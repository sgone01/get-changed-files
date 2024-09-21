import * as core from '@actions/core'
import {context, GitHub} from '@actions/github'
import * as fs from 'fs/promises'  // Use fs promises for async handling
import * as path from 'path'

type Format = 'space-delimited' | 'csv' | 'json'
type FileStatus = 'added' | 'modified' | 'removed' | 'renamed'

async function run(): Promise<void> {
  try {
    const client = new GitHub(core.getInput('token', {required: true}))
    const format = core.getInput('format', {required: true}) as Format
    const excludeFilePath = core.getInput('exclude-file', {required: false})

    // Validate format
    if (!['space-delimited', 'csv', 'json'].includes(format)) {
      return core.setFailed(`Invalid format: ${format}. Supported formats: 'space-delimited', 'csv', 'json'.`)
    }

    const {base, head} = extractCommits(context)

    if (!base || !head) {
      return core.setFailed('Base or head commit is missing.')
    }

    const excludedItems = await getExcludedItems(excludeFilePath)

    const response = await client.repos.compareCommits({
      base,
      head,
      owner: context.repo.owner,
      repo: context.repo.repo
    })

    if (response.status !== 200) {
      return core.setFailed(`GitHub API error: ${response.status}`)
    }

    if (response.data.status !== 'ahead') {
      return core.setFailed('The head commit is not ahead of the base commit.')
    }

    const categorizedFiles = categorizeFiles(response.data.files || [], excludedItems)

    // Format and output results
    const formattedOutput = formatOutput(categorizedFiles, format)
    logAndSetOutputs(formattedOutput)

  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`)
  }
}

// Extract commits based on event context
function extractCommits(context: any): {base?: string, head?: string} {
  const eventName = context.eventName
  let base: string | undefined, head: string | undefined

  if (eventName === 'pull_request') {
    base = context.payload.pull_request?.base?.sha
    head = context.payload.pull_request?.head?.sha
  } else if (eventName === 'push') {
    base = context.payload.before
    head = context.payload.after
  } else {
    core.setFailed(`Unsupported event: ${eventName}`)
  }

  return {base, head}
}

// Fetch and parse the exclude file asynchronously
async function getExcludedItems(excludeFilePath?: string): Promise<string[]> {
  if (!excludeFilePath) return []

  try {
    const fileContents = await fs.readFile(excludeFilePath, 'utf-8')
    return fileContents
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')) // Ignore comments and empty lines
  } catch (error) {
    core.info('Exclude file not present or unreadable.')
    return []
  }
}

// Categorize files based on their status and apply exclusion
function categorizeFiles(files: any[], excludedItems: string[]): Record<string, string[]> {
  const categories = {
    all: [] as string[],
    added: [] as string[],
    modified: [] as string[],
    removed: [] as string[],
    renamed: [] as string[],
    addedModified: [] as string[]
  }

  files.forEach(file => {
    const filename = file.filename
    if (excludedItems.some(exclude => filename.startsWith(exclude))) {
      core.info(`Excluding file: ${filename}`)
      return
    }

    categories.all.push(filename)
    if (file.status === 'added') {
      categories.added.push(filename)
      categories.addedModified.push(filename)
    } else if (file.status === 'modified') {
      categories.modified.push(filename)
      categories.addedModified.push(filename)
    } else if (file.status === 'removed') {
      categories.removed.push(filename)
    } else if (file.status === 'renamed') {
      categories.renamed.push(filename)
    } else {
      core.setFailed(`Unknown file status: ${file.status}`)
    }
  })

  return categories
}

// Format output based on the specified format
function formatOutput(files: Record<string, string[]>, format: Format): Record<string, string> {
  const formatter = (arr: string[]) => {
    switch (format) {
      case 'space-delimited': return arr.join(' ')
      case 'csv': return arr.join(',')
      case 'json': return JSON.stringify(arr)
      default: return ''
    }
  }

  return {
    all: formatter(files.all),
    added: formatter(files.added),
    modified: formatter(files.modified),
    removed: formatter(files.removed),
    renamed: formatter(files.renamed),
    addedModified: formatter(files.addedModified)
  }
}

// Log outputs and set them in the action's output context
function logAndSetOutputs(formattedOutput: Record<string, string>): void {
  for (const [key, value] of Object.entries(formattedOutput)) {
    core.info(`${key}: ${value}`)
    core.setOutput(key, value)
  }

  // For backward compatibility
  core.setOutput('deleted', formattedOutput.removed)
}

run()
