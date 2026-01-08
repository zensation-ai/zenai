#!/usr/bin/env python3
"""
Find all Swift files not in Xcode project and add them.
"""

import os
import re
import glob

def find_missing_files():
    """Find all Swift files not in the project"""
    project_path = "PersonalAIBrain.xcodeproj/project.pbxproj"

    with open(project_path, 'r') as f:
        content = f.read()

    # Find all Swift files in the directory
    all_swift = glob.glob("PersonalAIBrain/**/*.swift", recursive=True)

    missing = []
    for filepath in all_swift:
        filename = os.path.basename(filepath)
        if filename not in content:
            # Determine group based on path
            if '/Views/' in filepath:
                if '/KnowledgeGraph/' in filepath:
                    group = 'KnowledgeGraph'
                else:
                    group = 'Views'
            elif '/Services/' in filepath:
                group = 'Services'
            elif '/Models/' in filepath:
                group = 'Models'
            elif '/Config/' in filepath:
                group = 'Config'
            elif '/Theme/' in filepath:
                group = 'Theme'
            elif '/Intents/' in filepath:
                group = 'Intents'
            else:
                group = 'PersonalAIBrain'

            missing.append({
                'name': filename,
                'path': filepath,
                'group': group
            })

    return missing, content

def generate_uuid(base, index):
    return f"{base}{index:05d}"

def add_files_to_project():
    missing_files, content = find_missing_files()

    if not missing_files:
        print("All Swift files already in project!")
        return

    print(f"Found {len(missing_files)} missing files:")
    for f in missing_files:
        print(f"  - {f['name']} ({f['group']})")

    # Find highest existing ID
    ids = re.findall(r'AAA(\d+)', content) + re.findall(r'AAC(\d+)', content) + re.findall(r'AAD(\d+)', content) + re.findall(r'AAE(\d+)', content) + re.findall(r'AAF(\d+)', content)
    max_id = max([int(id_num) for id_num in ids]) if ids else 0
    next_id = max_id + 1

    # Prepare insertions
    build_file_entries = []
    file_ref_entries = []
    build_phase_entries = []
    group_entries = {}

    for file_info in missing_files:
        build_file_id = generate_uuid('AAF', next_id)
        file_ref_id = generate_uuid('AAF', next_id + 1)
        next_id += 2

        build_file_entries.append(
            f"\t\t{build_file_id} /* {file_info['name']} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_ref_id}; }};"
        )
        file_ref_entries.append(
            f"\t\t{file_ref_id} /* {file_info['name']} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {file_info['name']}; sourceTree = \"<group>\"; }};"
        )
        build_phase_entries.append(f"\t\t\t\t{build_file_id} /* {file_info['name']} in Sources */,")

        group = file_info['group']
        if group not in group_entries:
            group_entries[group] = []
        group_entries[group].append(f"\t\t\t\t{file_ref_id} /* {file_info['name']} */,")

    # Insert into PBXBuildFile section
    build_file_pattern = r'(/\* End PBXBuildFile section \*/)'
    build_file_insert = '\n'.join(build_file_entries) + '\n'
    content = re.sub(build_file_pattern, build_file_insert + r'\1', content)

    # Insert into PBXFileReference section
    file_ref_pattern = r'(/\* End PBXFileReference section \*/)'
    file_ref_insert = '\n'.join(file_ref_entries) + '\n'
    content = re.sub(file_ref_pattern, file_ref_insert + r'\1', content)

    # Insert into PBXSourcesBuildPhase
    sources_pattern = r'(/\* Sources \*/ = \{[^}]+isa = PBXSourcesBuildPhase;[^}]+files = \(\n)([\s\S]*?)(\n\t+\);)'

    def add_to_sources(match):
        existing = match.group(2).rstrip()
        new_entries = '\n'.join(build_phase_entries)
        return match.group(1) + existing + '\n' + new_entries + match.group(3)

    content = re.sub(sources_pattern, add_to_sources, content)

    # Insert into groups
    for group_name, entries in group_entries.items():
        if not entries:
            continue

        # Try to find existing group
        group_pattern = rf'(/\* {re.escape(group_name)} \*/ = \{{\s*isa = PBXGroup;\s*children = \(\n)([\s\S]*?)(\n\t+\);)'

        match = re.search(group_pattern, content)
        if match:
            def add_to_group(m):
                existing = m.group(2).rstrip()
                new_entries = '\n'.join(entries)
                return m.group(1) + existing + '\n' + new_entries + m.group(3)
            content = re.sub(group_pattern, add_to_group, content)
            print(f"Added files to existing group: {group_name}")
        else:
            print(f"Warning: Group '{group_name}' not found - files may need manual addition")

    # Write back
    with open("PersonalAIBrain.xcodeproj/project.pbxproj", 'w') as f:
        f.write(content)

    print(f"\nSuccessfully processed {len(missing_files)} files!")

if __name__ == '__main__':
    os.chdir('/Users/alexanderbering/Projects/KI-AB/ios')
    add_files_to_project()
