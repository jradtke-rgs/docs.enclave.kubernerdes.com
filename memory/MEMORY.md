# Project Memory: docs.enclave.kubernerdes.com

## OS Platform
- Admin host (nuc-00) and all infrastructure VMs run **openSUSE Leap 15.5**
- Download: https://get.opensuse.org/leap/15.5/
- Package manager: `zypper` (not dnf/yum)
- Apache package: `apache2` (not httpd); service name: `apache2`
- TFTP package: `tftp` (not tftp-server)
- No SELinux (uses AppArmor); `semanage`/`restorecon` do not apply
- AutoYaST for automated installs (not kickstart); kernel arg: `autoyast=file:///...`
- virt-install os-variant: `opensuse15.5`
- ISO filename pattern: `openSUSE-Leap-15.5-DVD-x86_64.iso`

## Key Conventions (from CLAUDE.md)
- Domain: `kubernerdes.com` (no extra 'e')
- Docs URL: `docs.enclave.kubernerdes.com`
- Day 0/1/2 operational framework
- Blog disabled
- Sidebar: explicit `enclaveSidebar`
