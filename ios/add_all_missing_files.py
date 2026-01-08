#!/usr/bin/env python3
"""
Add all missing Swift files to Xcode project.pbxproj
"""

import re

def generate_uuid(index):
    """Generate a unique UUID-like identifier for Xcode"""
    return f"AAE{index:05d}"

def add_files_to_project():
    project_path = "PersonalAIBrain.xcodeproj/project.pbxproj"

    # Files to add (all missing files)
    new_files = [
        # Models
        {
            'name': 'Incubator.swift',
            'path': 'Models/Incubator.swift',
            'group': 'Models'
        },
        # Views
        {
            'name': 'IncubatorView.swift',
            'path': 'Views/IncubatorView.swift',
            'group': 'Views'
        },
        {
            'name': 'LockScreenView.swift',
            'path': 'Views/LockScreenView.swift',
            'group': 'Views'
        },
        # Intents
        {
            'name': 'AppIntents.swift',
            'path': 'Intents/AppIntents.swift',
            'group': 'Intents'
        }
    ]

    # Read project file
    with open(project_path, 'r') as f:
        content = f.read()

    # Find highest existing ID
    ids = re.findall(r'AAA(\d+)', content) + re.findall(r'AAC(\d+)', content) + re.findall(r'AAD(\d+)', content) + re.findall(r'AAE(\d+)', content)
    max_id = max([int(id_num) for id_num in ids]) if ids else 0

    # Generate new IDs
    next_id = max_id + 1

    # Prepare insertions
    build_file_entries = []
    file_ref_entries = []
    build_phase_entries = []
    group_entries = {'Models': [], 'Services': [], 'Views': [], 'Intents': []}

    for i, file_info in enumerate(new_files):
        build_file_id = generate_uuid(next_id)
        file_ref_id = generate_uuid(next_id + 1)
        next_id += 2

        # Build file entry
        build_file_entries.append(
            f"\t\t{build_file_id} /* {file_info['name']} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_ref_id}; }};"
        )

        # File reference entry
        file_ref_entries.append(
            f"\t\t{file_ref_id} /* {file_info['name']} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {file_info['name']}; sourceTree = \"<group>\"; }};"
        )

        # Build phase entry
        build_phase_entries.append(f"\t\t\t\t{build_file_id} /* {file_info['name']} in Sources */,")

        # Group entry
        group_entries[file_info['group']].append(f"\t\t\t\t{file_ref_id} /* {file_info['name']} */,")

    # Insert into PBXBuildFile section
    build_file_pattern = r'(\/\* End PBXBuildFile section \*\/)'
    build_file_insert = '\n'.join(build_file_entries) + '\n'
    content = re.sub(build_file_pattern, build_file_insert + r'\1', content)

    # Insert into PBXFileReference section
    file_ref_pattern = r'(\/\* End PBXFileReference section \*\/)'
    file_ref_insert = '\n'.join(file_ref_entries) + '\n'
    content = re.sub(file_ref_pattern, file_ref_insert + r'\1', content)

    # Insert into PBXSourcesBuildPhase (find it and add files)
    sources_pattern = r'(\/\* Sources \*\/ = \{[^}]+files = \(\n)(.*?)(\n\s+\);)'
    def add_to_sources(match):
        return match.group(1) + match.group(2) + '\n' + '\n'.join(build_phase_entries) + match.group(3)
    content = re.sub(sources_pattern, add_to_sources, content, flags=re.DOTALL)

    # Insert into appropriate groups
    for group_name, entries in group_entries.items():
        if entries:
            # Find the group section
            group_pattern = rf'(AAA\d+\s+\/\*\s+{group_name}\s+\*\/\s+=\s+\{{\s+isa\s+=\s+PBXGroup;\s+children\s+=\s+\(\n)(.*?)(\n\s+\);)'
            def add_to_group(match):
                return match.group(1) + match.group(2) + '\n' + '\n'.join(entries) + match.group(3)
            content = re.sub(group_pattern, add_to_group, content, flags=re.DOTALL)

    # Write back
    with open(project_path, 'w') as f:
        f.write(content)

    print("Successfully added files to Xcode project!")
    for file_info in new_files:
        print(f"   - {file_info['name']}")

if __name__ == '__main__':
    add_files_to_project()
