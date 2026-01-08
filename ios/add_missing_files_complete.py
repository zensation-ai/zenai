#!/usr/bin/env python3
"""
Add ALL missing Swift files to Xcode project.pbxproj
Includes Config/, Services/, and other missing files
"""

import re
import os

def generate_uuid(base, index):
    """Generate a unique UUID-like identifier for Xcode"""
    return f"{base}{index:05d}"

def add_files_to_project():
    project_path = "PersonalAIBrain.xcodeproj/project.pbxproj"

    # Read project file
    with open(project_path, 'r') as f:
        content = f.read()

    # Files to add - check which are missing
    all_files = [
        {'name': 'Environment.swift', 'path': 'PersonalAIBrain/Config/Environment.swift', 'group': 'Config'},
        {'name': 'BiometricService.swift', 'path': 'PersonalAIBrain/Services/BiometricService.swift', 'group': 'Services'},
        {'name': 'IncubatorService.swift', 'path': 'PersonalAIBrain/Services/IncubatorService.swift', 'group': 'Services'},
        {'name': 'KeychainService.swift', 'path': 'PersonalAIBrain/Services/KeychainService.swift', 'group': 'Services'},
        {'name': 'WidgetDataService.swift', 'path': 'PersonalAIBrain/Services/WidgetDataService.swift', 'group': 'Services'},
    ]

    # Filter out files already in project
    new_files = []
    for f in all_files:
        if f['name'] not in content:
            new_files.append(f)
            print(f"Adding: {f['name']}")
        else:
            print(f"Already in project: {f['name']}")

    if not new_files:
        print("All files already in project!")
        return

    # Find highest existing ID
    ids = re.findall(r'AAA(\d+)', content) + re.findall(r'AAC(\d+)', content) + re.findall(r'AAD(\d+)', content) + re.findall(r'AAE(\d+)', content)
    max_id = max([int(id_num) for id_num in ids]) if ids else 0
    next_id = max_id + 1

    # Prepare insertions
    build_file_entries = []
    file_ref_entries = []
    build_phase_entries = []

    # Track Config group entries separately (might need to create the group)
    config_group_entries = []
    services_group_entries = []

    for i, file_info in enumerate(new_files):
        build_file_id = generate_uuid('AAE', next_id)
        file_ref_id = generate_uuid('AAE', next_id + 1)
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

        # Group entries
        if file_info['group'] == 'Config':
            config_group_entries.append(f"\t\t\t\t{file_ref_id} /* {file_info['name']} */,")
        elif file_info['group'] == 'Services':
            services_group_entries.append(f"\t\t\t\t{file_ref_id} /* {file_info['name']} */,")

    # Insert into PBXBuildFile section (before the End marker)
    build_file_pattern = r'(/\* End PBXBuildFile section \*/)'
    build_file_insert = '\n'.join(build_file_entries) + '\n'
    content = re.sub(build_file_pattern, build_file_insert + r'\1', content)

    # Insert into PBXFileReference section
    file_ref_pattern = r'(/\* End PBXFileReference section \*/)'
    file_ref_insert = '\n'.join(file_ref_entries) + '\n'
    content = re.sub(file_ref_pattern, file_ref_insert + r'\1', content)

    # Insert into PBXSourcesBuildPhase
    # Find the Sources build phase for PersonalAIBrain target
    sources_pattern = r'(/\* Sources \*/ = \{[^}]+isa = PBXSourcesBuildPhase;[^}]+files = \(\n)([\s\S]*?)(\n\t+\);)'

    def add_to_sources(match):
        existing = match.group(2).rstrip()
        new_entries = '\n'.join(build_phase_entries)
        return match.group(1) + existing + '\n' + new_entries + match.group(3)

    content = re.sub(sources_pattern, add_to_sources, content)

    # Insert into Services group (find existing Services group and add)
    if services_group_entries:
        # Pattern to find Services group children
        services_pattern = r'(/\* Services \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)([\s\S]*?)(\n\t+\);)'

        def add_to_services(match):
            existing = match.group(2).rstrip()
            new_entries = '\n'.join(services_group_entries)
            return match.group(1) + existing + '\n' + new_entries + match.group(3)

        content = re.sub(services_pattern, add_to_services, content)

    # For Config group - we might need to create it if it doesn't exist
    if config_group_entries and '/* Config */' not in content:
        # We need to create the Config group and add it to PersonalAIBrain group
        config_group_id = generate_uuid('AAE', next_id)
        next_id += 1

        # Create Config group entry
        config_group = f"""		{config_group_id} /* Config */ = {{
			isa = PBXGroup;
			children = (
{chr(10).join(config_group_entries)}
			);
			path = Config;
			sourceTree = "<group>";
		}};
"""

        # Add to PBXGroup section
        group_section_end = r'(/\* End PBXGroup section \*/)'
        content = re.sub(group_section_end, config_group + r'\1', content)

        # Add Config group to PersonalAIBrain group children
        pb_group_pattern = r'(/\* PersonalAIBrain \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)([\s\S]*?)(\n\t+\);)'

        def add_config_to_pb(match):
            existing = match.group(2).rstrip()
            new_entry = f"\t\t\t\t{config_group_id} /* Config */,"
            return match.group(1) + existing + '\n' + new_entry + match.group(3)

        content = re.sub(pb_group_pattern, add_config_to_pb, content)
    elif config_group_entries:
        # Config group exists, just add to it
        config_pattern = r'(/\* Config \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)([\s\S]*?)(\n\t+\);)'

        def add_to_config(match):
            existing = match.group(2).rstrip()
            new_entries = '\n'.join(config_group_entries)
            return match.group(1) + existing + '\n' + new_entries + match.group(3)

        content = re.sub(config_pattern, add_to_config, content)

    # Write back
    with open(project_path, 'w') as f:
        f.write(content)

    print("\nSuccessfully added files to Xcode project!")

if __name__ == '__main__':
    os.chdir('/Users/alexanderbering/Projects/KI-AB/ios')
    add_files_to_project()
